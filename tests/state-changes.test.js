import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mergeStateChanges,saveRecruitmentState} from '../server/state-changes.js';
import {visibleState} from '../server/database.js';
import {validateHRState} from '../server/validation.js';
import {stateChanges} from '../src/repository.js';
import {applicationFromCandidate} from '../src/intake.js';
const hr={id:'hr',name:'HR甲',role:'HR',frozen:0},other={id:'hr2',name:'HR乙',role:'HR',frozen:0},admin={id:'admin',name:'管理员',role:'admin',frozen:0},interviewer={id:'i',name:'面试官',role:'interviewer',frozen:0},people=[hr,other,admin,interviewer];
const files=[{id:'f',name:'简历.pdf',mime:'application/pdf',size:100}];
const wire=value=>JSON.parse(JSON.stringify(value));
function fixture(){
 const s={candidates:['c1','c2','c3'].map((id,i)=>({id,name:'候选人'+i,phone:'1380013800'+i,email:id+'@example.com',age:'28',highestEducation:'本科',education:'普本',experience:'3',company:'公司',currentTitle:'产品经理',city:'杭州',notes:'已电话沟通，候选人对岗位意向明确，可两周内到岗，建议进入业务面试。',resumes:[{id:'f',name:files[0].name,type:files[0].mime,size:100}]})),templates:[{id:'t',name:'产品经理',jd:'原 JD',nodes:[{name:'初试',interviewer:''}]}],applications:[]};
 for(const [i,actor] of [hr,other].entries()){
  const app=applicationFromCandidate(s,{candidateId:s.candidates[i].id,templateId:'t',resumeId:'f',reviewer:''},actor.name);
  s.applications.push(validateHRState({...s,applications:[]},{...s,applications:[app]},[interviewer.name],files,actor.name,[interviewer.name],actor).applications[0]);
 }
 return wire(s);
}
const view=(s,actor=hr,revision=1)=>wire(visibleState(s,actor,people,revision));
const empty=()=>({candidates:[],applications:[],templates:[]});
function poolFor(state,{actor=hr,revision=50}={}){
 let writes=0,audits=[],rolledBack=0,locks=0,commits=0;
 const context=[...people.map(p=>({...p,...(p.id===actor.id?actor:{}),kind:'user'})),...files.map(f=>({...f,kind:'file'}))];
 const conn={beginTransaction:async()=>{},query:async sql=>{
  if(sql.includes('FROM recruitment_state')){assert.match(sql,/FOR UPDATE/);locks++;return [[{payload:structuredClone(state),revision}]];}
  if(sql.includes('UNION ALL'))return [context];
  if(sql.includes('recruitment_availability'))return [[]];
  throw Error('Unexpected SQL');
 },execute:async(sql,args)=>{if(sql.startsWith('UPDATE recruitment_state')){Object.assign(state,JSON.parse(args[0]));revision++;writes++;}else audits.push(args);},commit:async()=>{commits++;},rollback:async()=>{rolledBack++;},release(){}};
 return {getConnection:async()=>conn,get writes(){return writes},get audits(){return audits},get rolledBack(){return rolledBack},get locks(){return locks},get commits(){return commits}};
}
test('按记录保存应聘时，其他 HR 新应聘、面评、简历资料和流程修改不会被覆盖或引起冲突',async()=>{
 const s=fixture(),before=view(s),edited=structuredClone(before);edited.applications[0].rounds.push({...edited.applications[0].rounds[0],id:'extra',name:'加面'});
 const changes=stateChanges(before,edited);assert.equal(changes.applications.length,1);assert.deepEqual(changes.candidates,[]);assert.deepEqual(changes.templates,[]);
 s.candidates[0].company='最新公司';s.templates[0].jd='最新 JD';s.applications[1].rounds[0].feedback={status:'submitted',summary:'最新正式面评',conclusion:'待定',submittedAt:'2026-10-27T01:00:00Z'};
 const newApp=structuredClone(s.applications[1]);newApp.id='parallel-app';newApp.candidateId='c3';newApp.rounds[0].id='parallel-round';s.applications.push(newApp);
 const original=structuredClone(s),pool=poolFor(s),saved=await saveRecruitmentState(pool,hr,{revision:1,changes,partialCandidates:true});
 assert.equal(saved.revision,51);assert.equal(saved.partialCandidates,true);assert.equal(s.applications[0].rounds.length,2);assert.deepEqual(s.applications.slice(1),original.applications.slice(1));assert.deepEqual(s.candidates,original.candidates);assert.deepEqual(s.templates,original.templates);assert.equal(pool.writes,1);assert.equal(pool.audits.length,1);assert.equal(pool.locks,1);
});
test('同一条应聘发生实际变化仍返回 409，事务不写入且不自动重试或覆盖',async()=>{
 const s=fixture(),before=view(s),edited=structuredClone(before);edited.applications[0].rounds[0].interviewer=interviewer.name;
 s.applications[0].rounds[0].feedback={status:'submitted',summary:'最新面评',conclusion:'待定'};const original=structuredClone(s),pool=poolFor(s);
 await assert.rejects(saveRecruitmentState(pool,hr,{revision:1,changes:stateChanges(before,edited)}),e=>e.status===409&&/这条应聘/.test(e.message));assert.equal(pool.writes,0);assert.equal(pool.rolledBack,1);assert.deepEqual(s,original);
});
test('隐藏的面评草稿正文并发更新不受 HR 保存影响，不将草稿正文返回 HR',async()=>{
 const s=fixture();s.applications[0].rounds[0].feedback={status:'draft',summary:'原私有草稿'};
 const before=view(s),edited=structuredClone(before);edited.applications[0].rounds.push({...edited.applications[0].rounds[0],id:'extra',name:'加面',feedback:{status:'none'}});
 s.applications[0].rounds[0].feedback.summary='最新私有草稿';const saved=await saveRecruitmentState(poolFor(s),hr,{revision:1,changes:stateChanges(before,edited)});
 assert.equal(s.applications[0].rounds[0].feedback.summary,'最新私有草稿');assert.equal(saved.applications[0].rounds[0].feedback.summary,undefined);
});
test('按记录请求仍检查实时角色、应聘所有者、正式面评锁、模板权限及不可删除应聘',async()=>{
 for(const mutate of [next=>next.applications[1].rounds[0].interviewer=interviewer.name,next=>next.templates=[],next=>next.applications.shift()]){
  const s=fixture(),before=view(s),next=structuredClone(before);mutate(next);const pool=poolFor(s);await assert.rejects(saveRecruitmentState(pool,hr,{revision:1,changes:stateChanges(before,next)}));assert.equal(pool.writes,0);
 }
 const s=fixture();s.applications[0].rounds[0].feedback={status:'submitted',conclusion:'待定',summary:'原结论'};const before=view(s),next=structuredClone(before);next.applications[0].rounds[0].feedback.summary='改写正式面评';const pool=poolFor(s);await assert.rejects(saveRecruitmentState(pool,hr,{revision:1,changes:stateChanges(before,next)}),/不能改写/);assert.equal(pool.writes,0);
 for(const actor of [{...hr,frozen:1},{...hr,role:'interviewer'}])await assert.rejects(saveRecruitmentState(poolFor(fixture(),{actor}),hr,{changes:empty()}),e=>e.status===403);
});
test('并发新应聘仍受候选人重复应聘和当前模板约束，冲突不产生第二条应聘',async()=>{
 const s=fixture(),before=view(s),next=structuredClone(before),newApp=applicationFromCandidate(next,{candidateId:'c3',templateId:'t',resumeId:'f',reviewer:''},hr.name);next.applications.push(newApp);
 const parallel=structuredClone(newApp);parallel.id='parallel';parallel.rounds[0].id='parallel-round';s.applications.push(parallel);const pool=poolFor(s);
 await assert.rejects(saveRecruitmentState(pool,hr,{revision:1,changes:stateChanges(before,next)}),/已有进行中/);assert.equal(pool.writes,0);
 const deleted=fixture();deleted.templates=[];await assert.rejects(saveRecruitmentState(poolFor(deleted),hr,{revision:1,changes:stateChanges(before,next)}),/所选流程名称/);
});
test('记录级保存排期仍重新校验面试官可用时间，不能绕过预约限制',async()=>{
 const s=fixture(),before=view(s),next=structuredClone(before),round=next.applications[0].rounds[0];
 Object.assign(round,{interviewer:interviewer.name,time:'2099-10-28T14:00',duration:60,location:'https://example.com/meeting',calendarSource:'external'});
 const pool=poolFor(s);await assert.rejects(saveRecruitmentState(pool,hr,{revision:1,changes:stateChanges(before,next)}),/不在面试官有效的可用时段/);assert.equal(pool.writes,0);assert.equal(pool.rolledBack,1);
});
test('模板删除沿用管理员权限与审计，保留全部历史应聘；空保存不更新版本或生成审计',async()=>{
 const s=fixture(),before=view(s,admin),next=structuredClone(before);next.templates=[];const original=structuredClone(s),pool=poolFor(s,{actor:admin});await saveRecruitmentState(pool,admin,{revision:1,changes:stateChanges(before,next)});
 assert.deepEqual(s.applications,original.applications);assert.deepEqual(s.candidates,original.candidates);assert.deepEqual(s.templates,[]);assert.equal(pool.audits.length,2);assert.match(pool.audits[0][1],/删除流程模板/);
 const noOp=poolFor(s);const saved=await saveRecruitmentState(noOp,hr,{revision:1,changes:empty()});assert.equal(saved.revision,50);assert.equal(noOp.writes,0);assert.equal(noOp.audits.length,0);assert.equal(noOp.commits,1);
});
test('旧版整包请求仍严格检查全站版本，新请求校验变更结构、重复 ID、基线与摘要',async()=>{
 const s=fixture(),original=structuredClone(s);await assert.rejects(saveRecruitmentState(poolFor(s),hr,{...view(s),revision:1}),e=>e.status===409);
 const before=view(s),patch={id:s.applications[0].id,before:before.applications[0],after:before.applications[0]};
 for(const bad of [{},{...empty(),unknown:[]},{...empty(),applications:[patch,patch]},{...empty(),applications:[{...patch,before:null}]},{...empty(),applications:[{...patch,after:null,id:'wrong'}]},{...empty(),candidates:[{id:'c1',before:{id:'c1',_summary:true},after:{id:'c1'}}]}])assert.throws(()=>mergeStateChanges(s,before,bad));
 assert.deepEqual(s,original,'纯合并拒绝请求不改变原数据');
});
