import {test} from 'node:test';
import assert from 'node:assert/strict';
import {progressInterview,saveHRProgression} from '../server/hr-progression.js';
import {pendingHRDecision,activateRoundReviews,reviewSourceValid} from '../src/round-review.js';
import {applicationStage,applicationProgress,round,validateSchedule} from '../src/model.js';
import {applicationWait} from '../src/application-wait.js';
import {validateHRState} from '../server/validation.js';
import {visibleState} from '../server/database.js';
import {decideRoundReview} from '../server/round-review.js';
import {reviewTerminationTargets} from '../src/review-termination.js';
import {feishuDesired,reviewCard} from '../server/feishu-model.js';
import {buildRecruitmentDashboard} from '../server/recruitment-dashboard.js';
const hr={id:'hr',name:'发起 HR',role:'HR'},other={id:'other',name:'其他 HR',role:'HR'},admin={id:'admin',name:'管理员',role:'admin'},one={id:'one',name:'一面官',role:'interviewer'},two={id:'two',name:'二面官',role:'interviewer'},three={id:'three',name:'三面官',role:'interviewer'};
const people=[hr,other,admin,one,two,three],names=[one.name,two.name,three.name],at='2026-10-27T03:00:00Z';
const file={id:'f',name:'cv.pdf',size:100,mime:'application/pdf'};
function make(conclusion='待定'){
 return {candidates:[{id:'c',name:'测试候选人',notes:'仅待审核人可见的沟通记录',resumes:[]}],templates:[],applications:[{id:'a',candidateId:'c',createdBy:hr.id,job:'产品经理',status:'进行中',reason:'',resume:{id:'f',name:'cv.pdf',size:100,type:'application/pdf'},screening:{status:'skipped',interviewer:''},history:[{at:'2026-10-26T00:00:00Z',actor:hr.name,action:'创建应聘'}],rounds:[{...round('初试'),id:'r1',interviewer:one.name,time:'2026-10-27T10:00',location:'https://example.com',feedback:{status:'submitted',conclusion,summary:'应保留的正式评价',author:one.name,submittedAt:at}},{...round('复试'),id:'r2',interviewer:two.name},{...round('终面'),id:'r3',interviewer:three.name}]}]};
}
const body={action:'next',sourceRoundId:'r1',interviewer:two.name,reason:'结合前置沟通继续验证产品能力'};
const progress=s=>progressInterview(s.applications[0],hr,people,body,at);
const cfg={backfill:true,bindings:{two:'ou_two',three:'ou_three'},calendarId:'calendar'};
const schedule={interviewer:two.name,time:'2026-10-30T14:00',mode:'线上',location:'https://example.com'};

test('待定/建议加面的当前节点指向原面评，正式通过、草稿、不通过和结束不出现 HR 推进入口',()=>{
 for(const conclusion of ['待定','建议加面']){const s=make(conclusion),a=s.applications[0];assert.equal(activateRoundReviews(a),false);assert.equal(pendingHRDecision(a).source.id,'r1');assert.match(applicationStage(a).name,conclusion==='待定'?/初试 · 结论待定/:/初试 · 建议加面/);assert.equal(applicationStage(a).awaitingHR,true);const steps=applicationProgress(a);assert.equal(steps.find(r=>r.id==='r1').done,true);assert.equal(steps.find(r=>r.id==='r2').done,false);}
 for(const patch of [{feedback:{status:'draft',conclusion:'待定'}},{feedback:{status:'returned',conclusion:'待定'}},{feedback:{status:'submitted',conclusion:'建议通过'}},{feedback:{status:'submitted',conclusion:'建议不通过'}}]){const a=make().applications[0];Object.assign(a.rounds[0],patch);assert.equal(pendingHRDecision(a),null);}
 for(const patch of [{status:'未录用'},{withdrawnAt:at}]){const a=make().applications[0];Object.assign(a,patch);assert.equal(pendingHRDecision(a),null);}
});
test('不追溯阻塞已经安排的历史下一轮；最后一轮待定可追加但无虚构下一轮',()=>{
 const a=make().applications[0];a.rounds[1].time='2026-10-30T14:00';assert.equal(pendingHRDecision(a),null);assert.equal(applicationStage(a).round.id,'r2');
 const last=make().applications[0];last.rounds=last.rounds.slice(0,1);assert.equal(pendingHRDecision(last).next,undefined);assert.throws(()=>progressInterview(last,hr,people,body),/追加面试/);progressInterview(last,hr,people,{...body,action:'additional',name:'补充面试'});assert.equal(last.rounds[1].review.status,'pending');
});
test('HR 显式推进仅产生本轮审核，原面评/等待起点保留，重复请求无副作用',()=>{
 const s=make(),a=s.applications[0],original=structuredClone(a.rounds[0].feedback),wait=applicationWait(a,Date.parse('2026-10-28T00:00:00Z'));progress(s);
 assert.deepEqual(a.rounds[0].feedback,original);assert.deepEqual(applicationWait(a,Date.parse('2026-10-28T00:00:00Z')),wait);assert.equal(pendingHRDecision(a),null);assert.equal(a.rounds[1].time,'');assert.equal(a.rounds[1].review.status,'pending');assert.equal(a.rounds[1].review.sourceProgressionId,a.rounds[0].hrProgression.id);assert.equal(a.rounds[0].hrProgression.actorId,hr.id);assert.equal(a.rounds[0].hrProgression.reason,body.reason);assert.equal(a.rounds[2].review,undefined);assert.match(a.history[0].action,/面评待定，HR 推进复试/);assert.equal(applicationStage(a).name,'复试');assert.match(applicationStage(a).detail,/审核简历/);
 const saved=structuredClone(a);assert.throws(()=>progress(s),e=>e.status===409);assert.deepEqual(a,saved);
 assert.throws(()=>validateSchedule(a,a.rounds[1],schedule),/简历审核/);decideRoundReview(a,a.rounds[1],two,'accepted');assert.doesNotThrow(()=>validateSchedule(a,a.rounds[1],schedule));assert.equal(a.rounds[1].time,'');
});
test('追加面试插在当前轮之后，保留既有未来轮次顺序/信息，加面通过后触发原复试审核',()=>{
 const s=make('建议加面'),a=s.applications[0],later=structuredClone(a.rounds.slice(1));const target=progressInterview(a,hr,people,{...body,action:'additional',name:'产品案例加面',interviewer:three.name},at);
 assert.deepEqual(a.rounds.map(r=>r.name),['初试','产品案例加面','复试','终面']);assert.deepEqual(a.rounds.slice(2),later);assert.equal(target.review.status,'pending');assert.equal(target.review.interviewer,three.name);assert.equal(a.rounds[0].feedback.conclusion,'建议加面');
 decideRoundReview(a,target,three,'accepted');target.feedback={status:'submitted',conclusion:'建议通过',submittedAt:'2026-10-28T00:00:00Z'};activateRoundReviews(a,hr.name);assert.equal(a.rounds[2].review.status,'pending');assert.equal(a.rounds[2].review.sourceRoundId,target.id);
});
test('推进只允许发起 HR/管理员，冻结账号/面试官/其他 HR 禁止；说明、面试官、轮次校验先于写入',()=>{
 for(const actor of [other,one,{...hr,frozen:1},null]){const a=make().applications[0],before=structuredClone(a);assert.throws(()=>progressInterview(a,actor,people,body),e=>e.status===403);assert.deepEqual(a,before);}
 assert.doesNotThrow(()=>progressInterview(make().applications[0],admin,people,body));
 const legacy=make().applications[0];delete legacy.createdBy;assert.doesNotThrow(()=>progressInterview(legacy,hr,people,body));
 for(const patch of [{reason:''},{reason:' '.repeat(4)},{reason:'字'.repeat(2001)},{interviewer:'不存在'},{action:'accept'},{sourceRoundId:'r3'},{action:'additional',name:''},{action:'additional',name:'初试'},{action:'additional',name:'字'.repeat(101)}]){const a=make().applications[0],before=structuredClone(a);assert.throws(()=>progressInterview(a,hr,people,{...body,...patch}));assert.deepEqual(a,before);}
 assert.throws(()=>progressInterview(make().applications[0],hr,people.map(p=>p.id===two.id?{...p,frozen:1}:p),body),/启用/);
 const a=make().applications[0];while(a.rounds.length<50)a.rounds.push(round('未来'+a.rounds.length));assert.throws(()=>progressInterview(a,hr,people,{...body,action:'additional',name:'加面'}),/50/);
});
test('源面评退回、重新提交或结论变化使旧审核/约面/终止权限及飞书任务失效',()=>{
 for(const patch of [{status:'returned'},{submittedAt:'2026-10-28T00:00:00Z'},{conclusion:'建议加面'},{conclusion:'建议通过'}]){const s=make(),a=s.applications[0];progress(s);decideRoundReview(a,a.rounds[1],two,'accepted');assert.equal(reviewTerminationTargets(a,two).length,1);Object.assign(a.rounds[0].feedback,patch);assert.equal(reviewSourceValid(a,a.rounds[1]),false);assert.throws(()=>validateSchedule(a,a.rounds[1],schedule),/简历审核/);assert.equal(reviewTerminationTargets(a,two).length,0);assert.equal(visibleState(s,two,people,1).applications.length,0);assert.equal(feishuDesired(s,people,cfg).some(t=>t.id==='round-review:a:r2'),false);}
 const s=make();progress(s);s.applications[0].rounds[0].feedback.submittedAt='2026-10-28T00:00:00Z';assert.equal(activateRoundReviews(s.applications[0]),false);assert.equal(pendingHRDecision(s.applications[0]).source.id,'r1');
});
test('审核拒绝继续终止流程但不改写原待定面评',()=>{
 const s=make(),a=s.applications[0];progress(s);decideRoundReview(a,a.rounds[1],two,'declined','经验不符');assert.equal(a.status,'未录用');assert.equal(a.rounds[0].feedback.conclusion,'待定');assert.equal(pendingHRDecision(a),null);
});
test('退回后重新提交待定必须由 HR 重新决定，重新发起会清除旧接受结果并保留历史',()=>{
 const s=make(),a=s.applications[0];progress(s);decideRoundReview(a,a.rounds[1],two,'accepted');const originalId=a.rounds[0].hrProgression.id;
 a.rounds[0].feedback.submittedAt='2026-10-28T00:00:00Z';assert.equal(pendingHRDecision(a).source.id,'r1');assert.equal(activateRoundReviews(a),false);
 progressInterview(a,hr,people,{...body,reason:'重新评估后继续推进'},'2026-10-28T01:00:00Z');assert.notEqual(a.rounds[0].hrProgression.id,originalId);assert.equal(a.rounds[1].review.status,'pending');assert.equal(a.rounds[1].review.reviewedAt,undefined);assert.equal(reviewSourceValid(a,a.rounds[1]),true);assert.equal(a.history.filter(h=>h.action.includes('HR 推进复试')).length,2);
});
test('推进记录不能通过 aggregate 伪造/改写；无关保存保留，换人重置审核不丢失源决定',()=>{
 const validate=(s,next)=>validateHRState(s,next,names,[file],hr.name,names,hr);
 const s=make(),forged=visibleState(s,hr,people,1);forged.applications[0].rounds[0].hrProgression={id:'fake',targetRoundId:'r2'};assert.throws(()=>validate(s,forged),/伪造/);
 progress(s);const next=visibleState(s,hr,people,2);next.applications[0].rounds[0].hrProgression.reason='篡改';assert.throws(()=>validate(s,next),/改写/);
 const missing=visibleState(s,hr,people,2);delete missing.applications[0].rounds[0].hrProgression;assert.deepEqual(validate(s,missing).applications[0].rounds[0].hrProgression,s.applications[0].rounds[0].hrProgression);
 decideRoundReview(s.applications[0],s.applications[0].rounds[1],two,'accepted');const changed=visibleState(s,hr,people,3);changed.applications[0].rounds[1].interviewer=three.name;const saved=validate(s,changed),a=saved.applications[0];assert.equal(a.rounds[1].review.status,'pending');assert.equal(a.rounds[1].review.interviewer,three.name);assert.equal(reviewSourceValid(a,a.rounds[1]),true);
});
test('待审人只见本轮与沟通简报；HR 决策说明不进入面试官/MCP，复用独立幂等飞书任务',()=>{
 const s=make();progress(s);const view=visibleState(s,two,people,1);assert.deepEqual(view.applications[0].rounds.map(r=>r.id),['r2']);assert.equal(view.candidates[0].notes,s.candidates[0].notes);assert.equal(visibleState(s,two,people,1,{screeningNotes:false}).applications.length,0);assert.equal(JSON.stringify(view).includes(body.reason),false);
 const own=visibleState(s,one,people,1);assert.equal(own.applications[0].rounds[0].hrProgression,undefined);assert.equal(visibleState(s,one,people,1,{screeningNotes:false}).applications[0].rounds[0].hrProgression,undefined);
 const jobs=feishuDesired(s,people,cfg);assert.equal(jobs.length,1);assert.equal(jobs[0].id,'round-review:a:r2');assert.equal(jobs[0].openId,'ou_two');assert.doesNotMatch(JSON.stringify(reviewCard(jobs[0],'https://example.com')),/上一轮面试已通过/);const before=structuredClone(s);assert.equal(activateRoundReviews(s.applications[0]),false);assert.deepEqual(s,before);decideRoundReview(s.applications[0],s.applications[0].rounds[1],two,'accepted');assert.equal(feishuDesired(s,people,cfg).length,0);
});
test('招聘大盘将待定归入 HR 决策，推进后归入本轮简历审核',()=>{
 const s=make();let dash=buildRecruitmentDashboard(s,people,admin,{},Date.parse('2026-10-28T00:00:00Z'));assert.equal(dash.queue[0].phase,'decision');assert.match(dash.queue[0].round,/初试.*待定/);progress(s);dash=buildRecruitmentDashboard(s,people,admin,{},Date.parse('2026-10-28T00:00:00Z'));assert.equal(dash.queue[0].phase,'review');assert.match(dash.queue[0].round,/复试简历审核/);
});
test('事务重新校验版本及实时账号权限，无效操作回滚且不写入',async()=>{
 for(const [revision,actor,status] of [[0,hr,409],[1,{...hr,frozen:1},403],[1,other,403],[1,{...hr,role:'interviewer'},403]]){let writes=0,rollback=false;const s=make();const conn={beginTransaction:async()=>{},query:async sql=>sql.includes('recruitment_state')?[[{revision:1,payload:structuredClone(s)}]]:[[...people.filter(p=>p.id!==actor.id),actor]],execute:async()=>{writes++},rollback:async()=>{rollback=true},release(){}};await assert.rejects(saveHRProgression({getConnection:async()=>conn},actor,'a',{...body,revision}),e=>e.status===status);assert.equal(writes,0);assert.equal(rollback,true);}
});
test('真实事务保存决定/审核/历史及审计，提交后重复版本不再写入',async()=>{
 let state=make(),revision=1,audits=0,commits=0;
 const conn={beginTransaction:async()=>{},query:async sql=>sql.includes('recruitment_state')?[[{revision,payload:structuredClone(state)}]]:[people],execute:async(sql,args)=>{if(sql.startsWith('UPDATE recruitment_state')){state=JSON.parse(args[0]);revision++;}else if(sql.startsWith('INSERT INTO recruitment_audit')){audits++;assert.equal(args[0],hr.id);assert.equal(args[2],'r2');}return [{}];},commit:async()=>{commits++},rollback:async()=>{},release(){}};
 const pool={getConnection:async()=>conn},result=await saveHRProgression(pool,hr,'a',{...body,revision:1});assert.equal(result.revision,2);assert.equal(result.applications[0].rounds[1].review.status,'pending');assert.equal(state.applications[0].rounds[0].hrProgression.reason,body.reason);assert.equal(commits,1);assert.equal(audits,1);await assert.rejects(saveHRProgression(pool,hr,'a',{...body,revision:1}),e=>e.status===409);assert.equal(audits,1);assert.equal(commits,1);
});
