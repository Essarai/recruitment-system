import {test} from 'node:test';
import assert from 'node:assert/strict';
import {round,pending,applicationStage,validateHREndApplication,endApplication,submitFeedback} from '../src/model.js';
import {hasInterviewArrangement} from '../src/interview-arrangement.js';
import {validateHRState} from '../server/validation.js';
import {visibleState} from '../server/database.js';
import {interviewGroups} from '../src/interview-groups.js';
import {canUploadTranscript} from '../server/transcripts.js';
import {feishuDesired,reconcileFeishuJobs} from '../server/feishu-model.js';
import {saveInterviewFeedback} from '../server/feedback.js';
const admin={id:'admin',name:'管理员',role:'admin'},hr={id:'hr',name:'HR',role:'HR'},person={id:'i',name:'甲',role:'interviewer'},names=['甲'];
const file={id:'f',name:'cv.pdf',mime:'application/pdf',size:10};
const fixture=()=>({candidates:[{id:'c',name:'补录候选人',phone:'13800000000',email:'test@example.com'}],templates:[],applications:[{id:'a',candidateId:'c',createdBy:'hr',job:'产品',status:'进行中',reason:'',screening:{status:'skipped',interviewer:'',reason:''},resume:{id:'f',name:file.name,type:file.mime,size:10},history:[],rounds:[{...round('初试'),id:'r'},{...round('复试'),id:'next',interviewer:'甲'}]}]});
function record(s,actor=admin){const next=structuredClone(s);Object.assign(next.applications[0].rounds[0],{mode:'特殊',interviewer:'甲',time:'',location:'',focus:'补录实际面试'});return validateHRState(s,next,names,[file],actor.name,names,actor);}
test('仅管理员可无时间地点补录特殊面试，登记时间服务端生成且不可伪造',()=>{
 const s=fixture();assert.throws(()=>record(s,hr),/仅管理员/);
 const saved=record(s),r=saved.applications[0].rounds[0];assert.ok(hasInterviewArrangement(r));assert.equal(r.time,'');assert.ok(Number.isFinite(Date.parse(r.specialRecordedAt)));
 const blocked=fixture();blocked.applications[0].screening={status:'pending',interviewer:'甲',reason:''};assert.equal(record(blocked).applications[0].screening.status,'skipped');
 const altered=structuredClone(saved);Object.assign(altered.applications[0].rounds[0],{mode:'线上',time:'2026-11-04T10:00',location:'https://example.com'});assert.throws(()=>validateHRState(saved,altered,names,[file],hr.name,names,hr),/仅管理员/);
 const forged=structuredClone(s);Object.assign(forged.applications[0].rounds[0],{mode:'特殊',specialRecordedAt:'2000-01-01',interviewer:'甲'});assert.throws(()=>validateHRState(s,forged,names,[file],admin.name,names,admin),/伪造/);
 const bad=structuredClone(s);Object.assign(bad.applications[0].rounds[0],{mode:'特殊',time:'2026-11-04T10:00',interviewer:'甲'});assert.throws(()=>validateHRState(s,bad,names,[file],admin.name,names,admin),/不填写时间/);
});
test('特殊面试出现在本人的待处理且可传对话，缺面评仍阻止普通结束，不进入即将面试或飞书日程',()=>{
 const s=record(fixture()),a=s.applications[0],r=a.rounds[0];assert.equal(pending(a),1);assert.match(applicationStage(a).detail,/待提交面评/);assert.throws(()=>validateHREndApplication(a,'未录用'),/未正式提交/);
 const view=visibleState(s,person,[],1),groups=interviewGroups(view,'甲');assert.equal(groups[0].feedback,1);assert.equal(groups[0].upcoming.length,0);assert.equal(groups[0].roundCount,1);assert.ok(canUploadTranscript(a,r,person));assert.equal(visibleState(s,{...person,name:'乙'},[],1).applications.length,0);
 const config={backfill:true,calendarId:'cal',bindings:{i:'ou_i'}};assert.equal(feishuDesired(s,[person],config).some(t=>t.kind==='round'),false);
 const retired=reconcileFeishuJobs(s,[{id:'round:a:r',kind:'round',application_id:'a',round_id:'r',desired:{id:'round:a:r',kind:'round',active:true,end:Date.now()+10000}}],[])[0];assert.equal(retired.active,false);assert.equal(retired.calendarSource,'external');
 assert.equal(endApplication(a,'候选人退出','主动退出').rounds[0].cancelled,false);
});
test('特殊面试正式面评沿用通过后下一轮审核、不通过终止和提交锁定',async()=>{
 for(const conclusion of ['建议通过','建议不通过']){
  const s=record(fixture());let revision=1;
  const conn={beginTransaction:async()=>{},query:async sql=>sql.includes('FROM recruitment_state')?[[{payload:structuredClone(s),revision}]]:[[person,admin,hr]],execute:async(sql,args)=>{if(sql.startsWith('UPDATE recruitment_state')){Object.assign(s,JSON.parse(args[0]));revision++;}},commit:async()=>{},rollback:async()=>{},release(){}};
  const pool={getConnection:async()=>conn,query:conn.query};
  await saveInterviewFeedback(pool,person,'a','r',{revision:1,feedback:{summary:'实际面试评价',conclusion}});
  const a=s.applications[0];assert.equal(a.rounds[0].feedback.status,'submitted');
  if(conclusion==='建议通过'){assert.equal(a.status,'进行中');assert.equal(a.rounds[1].review.status,'pending');}else{assert.equal(a.status,'未录用');assert.equal(a.rounds[1].cancelled,true);}
  assert.throws(()=>submitFeedback(a,a.rounds[0],'甲',{summary:'修改',conclusion}),/锁定/);
 }
});

test('管理员补录后续特殊面试不受待审核阻拦，原审核留档，普通排期仍须审核',()=>{
 const s=fixture(),a=s.applications[0],r=a.rounds[1];a.rounds[0].feedback={status:'submitted',conclusion:'建议通过',submittedAt:'2026-11-01T00:00:00Z'};
 r.review={status:'pending',interviewer:'甲',sourceRoundId:'r',sourceSubmittedAt:'2026-11-01T00:00:00Z'};
 const input=structuredClone(s);Object.assign(input.applications[0].rounds[1],{mode:'特殊',interviewer:'甲'});
 const saved=validateHRState(s,input,names,[file],admin.name,names,admin),special=saved.applications[0].rounds[1];assert.ok(special.specialRecordedAt);assert.equal(special.review,undefined);assert.equal(special.specialPreviousReview.status,'pending');
 const view=visibleState(saved,person,[],1);assert.equal(interviewGroups(view,'甲')[0].feedback,1);assert.equal(interviewGroups(view,'甲')[0].reviews,0);assert.equal(view.applications[0].rounds[0].specialPreviousReview,undefined);
 const normal=structuredClone(s);Object.assign(normal.applications[0].rounds[1],{time:'2099-11-08T10:00',location:'https://example.com',mode:'线上'});assert.throws(()=>validateHRState(s,normal,names,[file],admin.name,names,admin),/本轮简历审核/);
});
