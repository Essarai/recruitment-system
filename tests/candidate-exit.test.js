import {test} from 'node:test';
import assert from 'node:assert/strict';
import {round,endApplication,validateHREndApplication,applicationResultLabel} from '../src/model.js';
import {visibleState} from '../server/database.js';
import {validateHRState} from '../server/validation.js';
import {saveInterviewFeedback} from '../server/feedback.js';
import {feishuDesired,reconcileFeishuJobs} from '../server/feishu-model.js';
import {syncFeishuJob} from '../server/feishu-worker.js';
import {buildRecruitmentDashboard} from '../server/recruitment-dashboard.js';
const hr={id:'hr',name:'HR甲',role:'HR'},other={id:'other',name:'HR乙',role:'HR'},admin={id:'admin',name:'管理员',role:'admin'},interviewer={id:'i',name:'面试官',role:'interviewer'},people=[hr,other,admin,interviewer];
const file={id:'file',name:'简历.pdf',mime:'application/pdf',type:'application/pdf',size:100};
const reason='已电话确认，候选人因个人安排明确退出本次应聘。';
const at='2026-11-03T02:00:00.000Z';
function fixture(){return {candidates:[{id:'c',name:'测试候选人',phone:'13800138000',email:'qa@example.com',notes:'已电话沟通，候选人意向明确，已核实工作职责和到岗时间。'}],templates:[],applications:[{id:'a',candidateId:'c',createdBy:hr.id,job:'产品经理',status:'进行中',reason:'',resume:{id:file.id,name:file.name,type:file.type,size:file.size},history:[{at:'2026-01-01T00:00:00Z',actor:hr.name,action:'创建应聘'}],screening:{status:'accepted',interviewer:interviewer.name},rounds:[
 {...round('已完成未交'),id:'past',interviewer:interviewer.name,time:'2026-01-02T10:00',location:'https://example.com',calendarSource:'system',feedback:{status:'draft',summary:'保留私有草稿'}},
 {...round('未来系统排期'),id:'future',interviewer:interviewer.name,time:'2099-01-01T10:00',location:'https://example.com',calendarSource:'system'},
 {...round('未来手动日程'),id:'external',interviewer:interviewer.name,time:'2099-01-02T10:00',location:'https://example.com',calendarSource:'external'},
 {...round('未安排'),id:'unused',interviewer:interviewer.name},
 {...round('正式面评'),id:'formal',interviewer:interviewer.name,time:'2026-01-01T10:00',feedback:{status:'submitted',summary:'原正式评价',conclusion:'建议通过',submittedAt:'2026-01-01T03:00:00Z'}}
 ]}]};}
function exit(s,actor=hr,mutate=()=>{}){
 const input=visibleState(s,actor,people,1);input.applications[0].status='候选人退出';input.applications[0].reason=reason;mutate(input.applications[0]);
 return validateHRState(s,input,[interviewer.name],[file],actor.name,[interviewer.name],actor);
}
test('仅候选人退出允许缺失面评；权限、原因及其他结束结果继续校验',()=>{
 const s=fixture(),a=s.applications[0];
 assert.doesNotThrow(()=>validateHREndApplication(a,'候选人退出'));
 for(const status of ['公司决定录用','未录用',undefined])assert.throws(()=>validateHREndApplication(a,status),/面评未正式提交/);
 for(const actor of [hr,admin])assert.equal(exit(s,actor).applications[0].status,'候选人退出');
 assert.throws(()=>exit(s,other),e=>e.status===403);
 assert.throws(()=>exit(s,hr,a=>a.reason='  '),/填写原因/);
 for(const mutate of [a=>a.rounds[0].cancelled=true,a=>a.rounds[0].time='2099-01-05T10:00',a=>a.screening.status='skipped',a=>a.rounds.pop()])assert.throws(()=>exit(s,hr,mutate),/不能同时修改/);
 assert.throws(()=>exit(s,hr,a=>{a.rounds.at(-1).feedback={status:'returned',returnReason:'同时退回'};}),/不能同时修改面评/);
 for(const status of ['公司决定录用','未录用'])assert.throws(()=>exit(s,hr,a=>{a.status=status;a.rounds[0].cancelled=true;}),/面评未正式提交/);
});
test('退出仅取消未来及未安排轮次，保留正式面评、私有草稿、历史与结束原因',()=>{
 const s=fixture(),original=structuredClone(s),saved=exit(s),a=saved.applications[0];
 assert.deepEqual(s,original);assert.equal(a.reason,reason);assert.ok(a.endedAt);
 assert.equal(a.rounds[0].cancelled,false);assert.equal(a.rounds[0].feedback.summary,'保留私有草稿');
 for(const id of ['future','external','unused'])assert.equal(a.rounds.find(r=>r.id===id).cancelled,true);
 assert.deepEqual(a.rounds.at(-1).feedback,original.applications[0].rounds.at(-1).feedback);
 assert.equal(a.history.at(-1).action,'创建应聘');assert.match(a.history[0].action,/候选人退出/);
 assert.equal(applicationResultLabel(a),'流程终止 · 候选人退出');
 const view=visibleState(saved,hr,people,2);assert.equal(view.applications[0].rounds[0].feedback.summary,undefined);
 view.applications[0].rounds[0].cancelled=true;assert.throws(()=>validateHRState(saved,view,[interviewer.name],[file],hr.name,[interviewer.name],hr),/已结束，不能变更安排/);
});
test('终止时间判断统一北京时间，开始过的面试保留，未来面试取消',()=>{
 const a=fixture().applications[0];a.rounds[0].time='2026-11-03T09:59';a.rounds[1].time='2026-11-03T10:01';
 const saved=endApplication(a,'候选人退出',reason,at);
 assert.equal(saved.rounds[0].cancelled,false);assert.equal(saved.rounds[1].cancelled,true);assert.equal(saved.endedAt,at);
});
test('退出关闭审核与未来系统日程，过去日程保留，不创建迟到邀请或操作手动日程',async()=>{
 const s=exit(fixture()),a=s.applications[0],config={backfill:true,calendarId:'calendar',bindings:{i:'ou_i'}};
 a.endedAt=at;const wanted=feishuDesired(s,people,config,Date.parse(at));
 const past=wanted.find(t=>t.roundId==='past'),future=wanted.find(t=>t.roundId==='future');
 assert.equal(past.active,false);assert.equal(past.keepPastEvent,true);assert.equal(future.active,false);assert.equal(future.keepPastEvent,undefined);
 assert.equal(wanted.some(t=>t.roundId==='external'),false);
 const calls=[],client={call:async(path,options)=>{calls.push({path,method:options.method});return {};}};
 const remote={eventId:'past-event',calendarId:'calendar',openId:'ou_i',closed:false};
 await syncFeishuJob({desired:past,remote},client,'https://example.com',async()=>{});assert.equal(calls.length,0);
 await syncFeishuJob({desired:past,remote:{}},client,'https://example.com',async()=>{});assert.equal(calls.length,0);
 const closed=await syncFeishuJob({desired:future,remote:{...remote,eventId:'future-event'}},client,'https://example.com',async()=>{});assert.equal(closed.closed,true);assert.equal(calls.length,1);assert.equal(calls[0].method,'DELETE');
 const pending={id:'review:a',kind:'review',application_id:'a',desired:{id:'review:a',kind:'review',active:true,screeningAt:'old'}};
 const retired=reconcileFeishuJobs(s,[pending],wanted,Date.parse(at)).find(t=>t.id===pending.id);assert.equal(retired.active,false);
});
function feedbackPool(s){let revision=1;const conn={beginTransaction:async()=>{},query:async sql=>sql.includes('FROM recruitment_state')?[[{payload:structuredClone(s),revision}]]:[people],execute:async(sql,params)=>{if(sql.startsWith('UPDATE recruitment_state')){Object.assign(s,JSON.parse(params[0]));revision++;}},commit:async()=>{},rollback:async()=>{},release(){}};return {getConnection:async()=>conn,query:conn.query};}
test('本人可在退出后补交已完成面评，负面结论也不改写退出结果；未来已取消的面试不能补交',async()=>{
 const s=exit(fixture()),pool=feedbackPool(s),a=s.applications[0],endedAt=a.endedAt;
 await assert.rejects(saveInterviewFeedback(pool,interviewer,'a','future',{revision:1}),e=>e.status===403);
 await assert.rejects(saveInterviewFeedback(pool,{...interviewer,name:'其他人'},'a','past',{revision:1}),e=>e.status===403);
 const saved=await saveInterviewFeedback(pool,interviewer,'a','past',{revision:1,feedback:{summary:'补交实际完成面试的评价',conclusion:'建议不通过'}});
 assert.equal(saved.applications[0].rounds.find(r=>r.id==='past').feedback.status,'submitted');
 assert.equal(s.applications[0].status,'候选人退出');assert.equal(s.applications[0].reason,reason);assert.equal(s.applications[0].endedAt,endedAt);
 await assert.rejects(saveInterviewFeedback(pool,interviewer,'a','past',{revision:2}),/已提交/);
 const stats=buildRecruitmentDashboard(s,people,hr);assert.equal(stats.analysis.summary.exited,1);
 assert.equal(stats.outcomes.find(o=>o.key==='withdrawn').count,1);assert.equal(stats.outcomes.find(o=>o.key==='interviewRejected').count,0);
});
