import {test} from 'node:test';
import assert from 'node:assert/strict';
import {applyCandidateChange,saveCandidateChange} from '../server/candidate-save.js';
const hr={id:'hr',name:'HR甲',role:'HR'},other={id:'hr2',name:'HR乙',role:'HR'},interviewer={id:'i',name:'面试官',role:'interviewer'};
const files=[{id:'f1',name:'旧简历.pdf',mime:'application/pdf',size:100},{id:'f2',name:'新简历.pdf',mime:'application/pdf',size:120},{id:'f3',name:'另一新版.pdf',mime:'application/pdf',size:150}];
const reference=f=>({id:f.id,name:f.name,type:f.mime,size:f.size});
function candidate(id='c'){return {id,name:'候选人'+id,phone:id==='c'?'13800138000':'13800138001',email:id+'@example.com',age:'28',highestEducation:'本科',education:'普本',experience:'3',company:'公司',currentTitle:'产品经理',city:'杭州',notes:'已完成前置电话沟通，求职意向明确，预计两周到岗，建议进入业务面试。',resumes:[reference(files[0])],createdBy:hr.id,createdAt:'2026-10-01T00:00:00Z'};}
const make=()=>({candidates:[candidate()],templates:[{id:'t',name:'新流程'}],applications:[{id:'a',status:'进行中',rounds:[{feedback:{status:'submitted',conclusion:'待定',summary:'最新面评'}}]}]});
test('导入只新增候选人，保留服务端最新应聘/模板/其他候选人及创建人归属',()=>{
 const s=make(),before=structuredClone(s),input=candidate('new');delete input.createdBy;delete input.createdAt;
 assert.equal(applyCandidateChange(s,{mode:'create',candidate:input,revision:-999},other,files).changed,true);assert.deepEqual(s.applications,before.applications);assert.deepEqual(s.templates,before.templates);assert.deepEqual(s.candidates[0],before.candidates[0]);assert.equal(s.candidates[1].createdBy,other.id);
 const saved=structuredClone(s);assert.equal(applyCandidateChange(s,{mode:'create',candidate:input},other,files).changed,false);assert.deepEqual(s,saved);
 const conflict={...input,city:'北京'};assert.throws(()=>applyCandidateChange(s,{mode:'create',candidate:conflict},other,files),e=>e.status===409);assert.deepEqual(s,saved);
});
test('并行导入同一联系方式不能产生重复档案，错误不会覆盖已有记录',()=>{
 const s=make(),before=structuredClone(s);assert.throws(()=>applyCandidateChange(s,{mode:'create',candidate:{...candidate('new'),phone:s.candidates[0].phone}},hr,files),/手机号或邮箱已存在/);assert.deepEqual(s,before);
 for(const patch of [{resumes:[]},{resumes:[{id:'missing'}]},{phone:'123'},{education:''},{notes:'未沟通'}]){const s=make(),before=structuredClone(s);assert.throws(()=>applyCandidateChange(s,{mode:'create',candidate:{...candidate('new'),...patch}},hr,files));assert.deepEqual(s,before);}
});
test('新增简历自动附加到最新版本列表，不覆盖并发上传的版本、候选人资料或应聘快照',()=>{
 const s=make();s.applications[0].resume={id:'snapshot-file'};const before=structuredClone(s);applyCandidateChange(s,{mode:'resume',candidate:{id:'c',resumes:[reference(files[1])],company:'不能改公司'}},hr,files);
 s.candidates[0].city='北京';applyCandidateChange(s,{mode:'resume',candidate:{id:'c',resumes:[reference(files[2])]}},other,files);
 assert.deepEqual(s.candidates[0].resumes.map(f=>f.id),['f3','f2','f1']);assert.equal(s.candidates[0].company,before.candidates[0].company);assert.equal(s.candidates[0].city,'北京');assert.deepEqual(s.applications,before.applications);
 const saved=structuredClone(s);assert.equal(applyCandidateChange(s,{mode:'resume',candidate:{id:'c',resumes:[reference(files[1])]}},hr,files).changed,false);assert.deepEqual(s,saved);
});
test('资料编辑合并不同字段及并发新增附件，同一字段发生不同改动则冲突且不写入',()=>{
 const s=make(),original=structuredClone(s.candidates[0]),edited={...original,company:'新公司'};
 s.candidates[0].city='北京';s.candidates[0].resumes.unshift(reference(files[1]));applyCandidateChange(s,{mode:'profile',candidate:edited,originalCandidate:original},hr,files);
 assert.equal(s.candidates[0].company,'新公司');assert.equal(s.candidates[0].city,'北京');assert.deepEqual(s.candidates[0].resumes.map(r=>r.id),['f2','f1']);
 const before=structuredClone(s);assert.throws(()=>applyCandidateChange(s,{mode:'profile',candidate:{...original,company:'另一个公司'},originalCandidate:original},other,files),e=>e.status===409&&/同一资料/.test(e.message));assert.deepEqual(s,before);
 assert.equal(applyCandidateChange(s,{mode:'profile',candidate:edited,originalCandidate:original},hr,files).changed,false);
});
test('拒绝冻结/面试官操作、错误模式、伪造基线和缺失档案',()=>{
 for(const actor of [null,interviewer,{...hr,frozen:1}])assert.throws(()=>applyCandidateChange(make(),{mode:'create',candidate:candidate('new')},actor,files),e=>e.status===403);
 assert.throws(()=>applyCandidateChange(make(),{mode:'profile',candidate:candidate()},hr,files),/完整候选人/);assert.throws(()=>applyCandidateChange(make(),{mode:'delete',candidate:candidate()},hr,files),/操作/);assert.throws(()=>applyCandidateChange(make(),{mode:'resume',candidate:{id:'missing',resumes:[reference(files[1])]}},hr,files),e=>e.status===409);
});
function poolFor(state,actor=hr){let revision=99,writes=0,audits=0,rollback=0;
 const conn={beginTransaction:async()=>{},query:async sql=>sql.includes('recruitment_state')?[[{revision,payload:structuredClone(state)}]]:sql.includes('recruitment_users')?[[actor,other,interviewer]]:[files],execute:async(sql,args)=>{if(sql.startsWith('UPDATE recruitment_state')){Object.assign(state,JSON.parse(args[0]));revision++;writes++;}else if(sql.startsWith('INSERT INTO recruitment_audit'))audits++;},commit:async()=>{},rollback:async()=>{rollback++},release(){}};
 return {getConnection:async()=>conn,get revision(){return revision},get writes(){return writes},get audits(){return audits},get rollback(){return rollback}};
}
test('真实保存事务以最新版本加锁更新，旧全站版本不再阻塞导入，重试不重复写入/审计',async()=>{
 const s=make(),original=structuredClone(s),pool=poolFor(s),body={mode:'create',candidate:candidate('new'),revision:1};delete body.candidate.createdBy;delete body.candidate.createdAt;
 const result=await saveCandidateChange(pool,hr,body);assert.equal(result.revision,100);assert.equal(result.partialCandidates,true);assert.equal(result.candidates.find(c=>c.id==='new')._summary,undefined);assert.deepEqual(s.applications,original.applications);assert.deepEqual(s.templates,original.templates);assert.equal(pool.audits,1);
 const retry=await saveCandidateChange(pool,hr,body);assert.equal(retry.revision,100);assert.equal(pool.writes,1);assert.equal(pool.audits,1);
});
test('事务重新验证实时身份并在真实资料冲突时回滚',async()=>{
 const s=make(),original=candidate();s.candidates[0].company='另一位 HR 已更新';const pool=poolFor(s);
 await assert.rejects(saveCandidateChange(pool,hr,{mode:'profile',candidate:{...original,company:'本地编辑'},originalCandidate:original}),e=>e.status===409);assert.equal(pool.writes,0);assert.equal(pool.rollback,1);
 for(const actor of [{...hr,frozen:1},{...hr,role:'interviewer'}]){const pool=poolFor(make(),actor);await assert.rejects(saveCandidateChange(pool,hr,{mode:'resume',candidate:{id:'c',resumes:[reference(files[1])]}}),e=>e.status===403);assert.equal(pool.writes,0);}
});
