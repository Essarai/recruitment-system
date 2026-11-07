import {test} from 'node:test';
import assert from 'node:assert/strict';
import {reassignInterviewer} from '../server/interviewer-reassignment.js';
import {round,validateSchedule} from '../src/model.js';
import {reviewSourceValid} from '../src/round-review.js';
import {visibleState} from '../server/database.js';
import {feishuDesired,reconcileFeishuJobs} from '../server/feishu-model.js';
const actor={id:'hr',name:'HR',role:'HR'},people=[actor,{id:'old',name:'原面试官',role:'interviewer'},{id:'new',name:'新面试官',role:'interviewer'}];
function app(){return {id:'a',candidateId:'c',createdBy:'hr',status:'进行中',screening:{status:'skipped'},history:[],rounds:[{...round('初试'),id:'first',interviewer:'原面试官',time:'2026-11-08T10:00',location:'https://example.com'},{...round('复试'),id:'second',interviewer:'原面试官'}]};}
test('首轮更换撤销排期并由新面试官确认；原面试官失去访问且不能直接约面',()=>{
 const a=app(),r=a.rounds[0];reassignInterviewer(a,r,actor,people,{interviewer:'新面试官',reason:'原面试官临时有事'});
 assert.equal(r.time,'');assert.equal(r.location,'');assert.equal(r.interviewer,'新面试官');assert.equal(a.screening.status,'pending');assert.equal(a.screening.interviewer,'新面试官');assert.equal(r.scheduleEvents.at(-1).previous.interviewer,'原面试官');
 assert.throws(()=>validateSchedule(a,r,{...r,time:'2026-11-08T10:00',location:'https://example.com'},['新面试官']),/简历确认/);
 const s={candidates:[{id:'c',name:'候选人'}],applications:[a],templates:[]};assert.equal(visibleState(s,people[1],people,1).applications.length,0);assert.equal(visibleState(s,people[2],people,1).applications.length,1);
});
test('后续轮次更换保留审核来源，重新确认后可约；旧飞书日程退役并产生新审核通知',()=>{
 const a=app(),prior=a.rounds[0],r=a.rounds[1];prior.feedback={status:'submitted',conclusion:'建议通过',submittedAt:'2026-11-01T00:00:00Z'};r.review={status:'accepted',interviewer:'原面试官',sourceRoundId:prior.id,sourceSubmittedAt:prior.feedback.submittedAt};r.time='2026-11-01T10:00';r.location='https://example.com';
 reassignInterviewer(a,r,actor,people,{interviewer:'新面试官',reason:'改派'},'2026-11-07T12:00:00Z');assert.ok(reviewSourceValid(a,r));assert.equal(r.review.status,'pending');
 const s={candidates:[{id:'c',name:'候选人'}],applications:[a],templates:[]},wanted=feishuDesired(s,people,{backfill:true,bindings:{new:'ou_new'},calendarId:'cal'});
 assert.ok(wanted.some(t=>t.kind==='review'&&t.userId==='new'));const retired=reconcileFeishuJobs(s,[{id:'round:a:second',kind:'round',application_id:'a',round_id:'second',desired:{id:'round:a:second',kind:'round',end:Date.parse('2026-11-01T11:00:00Z'),active:true}}],wanted).find(t=>t.id==='round:a:second');assert.equal(retired.active,false);
 r.review.status='accepted';assert.doesNotThrow(()=>validateSchedule(a,r,{...r,time:'2026-11-08T10:00',location:'https://example.com'},['新面试官']));
});
test('禁止非发起人、冻结新面试官、欠补充、已有面评或特殊面试更换',()=>{
 for(const status of ['draft','submitted','returned']){const a=app();a.rounds[0].feedback.status=status;assert.throws(()=>reassignInterviewer(a,a.rounds[0],actor,people,{interviewer:'新面试官',reason:'改派'}),/面评/);}
 const a=app(),body={interviewer:'新面试官',reason:'改派'};assert.throws(()=>reassignInterviewer(a,a.rounds[0],{...actor,id:'other'},people,body),e=>e.status===403);assert.throws(()=>reassignInterviewer(a,a.rounds[0],actor,people.map(p=>p.id==='new'?{...p,frozen:true}:p),body),/启用/);assert.throws(()=>reassignInterviewer(a,a.rounds[0],actor,people,{...body,reason:''}),/原因/);
 a.screening.status='needs_info';assert.throws(()=>reassignInterviewer(a,a.rounds[0],actor,people,body),/补充/);
});

test('换人可同时暂存新链接时间；审核前不约面，审核通过后原子生效',async()=>{
 const {activatePendingArrangement}=await import('../server/pending-arrangement.js');const a=app(),r=a.rounds[0],arrangement={time:'2099-11-08T10:00',location:'https://example.com/new',mode:'线上',duration:60,calendarSource:'system',focus:'新重点'};
 reassignInterviewer(a,r,actor,people,{interviewer:'新面试官',reason:'改派并修改链接',arrangement});
 const s={candidates:[{id:'c',name:'候选人'}],applications:[a],templates:[]},conn={query:async()=>[[{user_id:'new',payload:{from:'2099-01-01',to:'2099-12-31',weekly:Array.from({length:7},()=>[{start:'09:00',end:'18:00'}]),exceptions:[]}}]]};
 assert.equal(r.time,'');assert.equal(r.pendingArrangement.location,arrangement.location);
 await activatePendingArrangement(conn,s,a,r,people);assert.equal(r.time,'');
 assert.equal(feishuDesired(s,people,{backfill:true,bindings:{new:'ou_new'},calendarId:'cal'}).some(t=>t.kind==='round'),false);
 a.screening.status='accepted';await activatePendingArrangement(conn,s,a,r,people);assert.equal(r.time,arrangement.time);assert.equal(r.location,arrangement.location);assert.equal(r.pendingArrangement,undefined);
 assert.ok(feishuDesired(s,people,{backfill:true,bindings:{new:'ou_new'},calendarId:'cal'}).some(t=>t.kind==='round'&&t.active));
});
test('审核通过时不可约则保留审核结果、排期不生效；过期审核不激活暂存安排',async()=>{
 const {activatePendingArrangement}=await import('../server/pending-arrangement.js');const a=app(),r=a.rounds[0];reassignInterviewer(a,r,actor,people,{interviewer:'新面试官',reason:'改派',arrangement:{time:'2099-11-08T10:00',location:'https://example.com',mode:'线上',duration:60,calendarSource:'system'}});
 const s={applications:[a]},conn={query:async()=>[[]]};a.screening.status='accepted';const epoch=a.screening.sentAt;a.screening.sentAt='new-epoch';await activatePendingArrangement(conn,s,a,r,people);assert.equal(r.pendingArrangement.status,'pending');a.screening.sentAt=epoch;
 await activatePendingArrangement(conn,s,a,r,people);assert.equal(r.time,'');assert.equal(a.screening.status,'accepted');assert.equal(r.pendingArrangement.status,'conflict');assert.match(r.pendingArrangement.error,/可用时段/);
});
