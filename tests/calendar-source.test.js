import {test} from 'node:test';
import assert from 'node:assert/strict';
import {round,validateSchedule} from '../src/model.js';
import {validateHRState} from '../server/validation.js';
import {feishuDesired,reconcileFeishuJobs} from '../server/feishu-model.js';
import {syncFeishuJob,observeFeishuJob} from '../server/feishu-worker.js';
import {activateRoundReviews} from '../src/round-review.js';
import {applicationWait} from '../src/application-wait.js';
import {visibleState} from '../server/database.js';
const hr={id:'hr',name:'测试 HR',role:'HR'},interviewer={id:'i',name:'面试官',role:'interviewer'},other={id:'other',name:'其他 HR',role:'HR'},people=[hr,interviewer,other],names=[interviewer.name];
const at='2026-10-27T02:00:00Z',now=Date.parse(at),files=[{id:'f',name:'cv.pdf',mime:'application/pdf',size:100}];
const cfg={backfill:true,calendarId:'calendar',bindings:{i:'ou_i'}};
function make(){return {candidates:[{id:'c',name:'候选人'}],templates:[],applications:[{id:'a',candidateId:'c',createdBy:hr.id,job:'产品经理',status:'进行中',reason:'',screening:{status:'skipped',interviewer:''},resume:{id:'f',name:'cv.pdf',type:'application/pdf',size:100},history:[{at,actor:hr.name,action:'创建应聘'}],rounds:[{...round('初试'),id:'r',interviewer:interviewer.name,time:'2026-10-28T14:00',duration:60,location:'https://vc.feishu.cn/j/test'}]}]};}
const validate=(before,next,actor=hr)=>validateHRState(before,next,names,files,actor.name,names,actor);
const task=s=>feishuDesired(s,people,cfg,now)[0];
const existing=(desired,remote={})=>({id:desired.id,kind:desired.kind,application_id:desired.appId,round_id:desired.roundId,desired,remote});

test('日程来源由服务端校验并保留；历史未设置的同步方式在无关保存中不改变',()=>{
 const s=make(),unchanged=validate(s,visibleState(s,hr,people,1));assert.equal(Object.hasOwn(unchanged.applications[0].rounds[0],'calendarSource'),false);assert.equal(feishuDesired(unchanged,people,cfg,now).length,1);
 const legacyForm=visibleState(s,hr,people,1);legacyForm.applications[0].rounds[0].calendarSource='system';assert.deepEqual(validate(s,legacyForm),unchanged);
 const input=visibleState(s,hr,people,1);input.applications[0].rounds[0].calendarSource='external';const saved=validate(s,input),r=saved.applications[0].rounds[0];assert.equal(r.calendarSource,'external');assert.equal(r.scheduleEvents.at(-1).type,'calendarSourceChanged');assert.match(saved.applications[0].history[0].action,/日程来源：由系统同步飞书日程 → 已有飞书日程，仅登记/);
 const omitted=visibleState(saved,hr,people,2);delete omitted.applications[0].rounds[0].calendarSource;assert.equal(validate(saved,omitted).applications[0].rounds[0].calendarSource,'external');
 for(const value of ['bad','toString','',null,{},true]){const next=visibleState(s,hr,people,1);next.applications[0].rounds[0].calendarSource=value;assert.throws(()=>validate(s,next),/日程来源/);assert.throws(()=>validateSchedule(s.applications[0],s.applications[0].rounds[0],{...s.applications[0].rounds[0],calendarSource:value}),/日程来源/);}
});
test('仅登记仍保存排期、会议链接及创建事件，不跳过初始/后续审核或 HR 所有权限制',()=>{
 const s=make();s.applications[0].rounds[0].time='';s.applications[0].rounds[0].location='';const input=visibleState(s,hr,people,1);Object.assign(input.applications[0].rounds[0],{time:'2026-10-28T14:00',location:'https://vc.feishu.cn/j/manual',calendarSource:'external'});const saved=validate(s,input);assert.equal(saved.applications[0].rounds[0].time,'2026-10-28T14:00');assert.equal(saved.applications[0].rounds[0].scheduleEvents[0].type,'created');assert.equal(feishuDesired(saved,people,cfg,now).length,0);
 assert.throws(()=>validate(s,input,other),/仅创建/);
 s.applications[0].screening={status:'pending',interviewer:interviewer.name};input.applications[0].screening=structuredClone(s.applications[0].screening);assert.throws(()=>validate(s,input),/简历确认/);
 const a=make().applications[0];a.rounds.push({...round('复试'),id:'r2'});assert.throws(()=>validateSchedule(a,a.rounds[1],{...a.rounds[0],calendarSource:'external'}),/本轮简历审核/);
});
test('已结束或正式面评锁定的排期不能借切换来源修改，切换不改变等待起点',()=>{
 const s=make();s.applications[0].rounds[0].time='2026-10-26T14:00';const input=visibleState(s,hr,people,1);input.applications[0].rounds[0].calendarSource='external';const saved=validate(s,input);assert.deepEqual(applicationWait(saved.applications[0],now),applicationWait(s.applications[0],now));
 for(const lock of ['feedback','ended']){const s=make();if(lock==='feedback')s.applications[0].rounds[0].feedback={status:'submitted',conclusion:'待定'};else s.applications[0].status='未录用';const input=visibleState(s,hr,people,1);input.applications[0].rounds[0].calendarSource='external';assert.throws(()=>validate(s,input),lock==='feedback'?/正式面评/:/应聘已结束/);}
});
test('外部日程只抑制日程任务，初始和后续简历审核通知仍然生成；补同步也不建日程',()=>{
 const s=make();s.applications[0].rounds[0].calendarSource='external';assert.equal(feishuDesired(s,people,cfg,now).length,0);s.applications[0].screening={status:'pending',interviewer:interviewer.name,sentAt:at};let jobs=feishuDesired(s,people,cfg,now);assert.deepEqual(jobs.map(t=>t.kind),['review']);
 s.applications[0].screening={status:'skipped',interviewer:''};s.applications[0].rounds[0].feedback={status:'submitted',conclusion:'建议通过',submittedAt:at};s.applications[0].rounds.push({...round('复试'),id:'r2',interviewer:interviewer.name,calendarSource:'external'});activateRoundReviews(s.applications[0],hr.name,at);jobs=feishuDesired(s,people,cfg,now);assert.equal(jobs.length,1);assert.equal(jobs[0].id,'round-review:a:r2');
});
test('新仅登记的安排不会进入创建队列；已有或排队中的系统日程切换后转为撤销任务',()=>{
 const s=make(),desired=task(s),old=existing(desired,{eventId:'system-event',calendarId:'calendar'});s.applications[0].rounds[0].calendarSource='external';const wanted=feishuDesired(s,people,cfg,now);assert.deepEqual(reconcileFeishuJobs(s,[],wanted,now),[]);
 const reconciled=reconcileFeishuJobs(s,[old],wanted,now);assert.equal(reconciled.length,1);assert.equal(reconciled[0].active,false);assert.equal(reconciled[0].calendarSource,'external');assert.equal(reconciled[0].id,desired.id);assert.deepEqual(reconcileFeishuJobs(s,[existing(reconciled[0])],wanted,now),reconciled);
 // A feedback submission or elapsed slot before the next tick must not revive an explicitly retired duplicate.
 s.applications[0].rounds[0].feedback.status='submitted';assert.equal(reconcileFeishuJobs(s,[old],[],desired.end+3600000)[0].calendarSource,'external');
 const legacy=make();assert.deepEqual(reconcileFeishuJobs(legacy,[old],[],desired.end+3600000),[]);legacy.applications[0].rounds[0].feedback.status='submitted';assert.deepEqual(reconcileFeishuJobs(legacy,[old],[],now),[]);
});
test('仅登记创建/修改/取消均不调用飞书；切换已有系统事件只删除其绑定 ID，重试幂等',async()=>{
 const s=make(),t={...task(s),active:false,calendarSource:'external',openId:''},calls=[],client={call:async(path,options)=>{calls.push({path,method:options?.method});return {};}};
 const quiet=await syncFeishuJob({desired:t,remote:{}},client,'http://localhost',async()=>{});assert.equal(quiet.closed,true);assert.equal(calls.length,0);
 const r=await syncFeishuJob({desired:t,remote:{eventId:'system-event',calendarId:'system-calendar',openId:'old-recipient',rsvp:'accept',proposal:{time:'old'}}},client,'http://localhost',async()=>{});assert.deepEqual(calls,[{path:'/calendar/v4/calendars/system-calendar/events/system-event',method:'DELETE'}]);assert.equal(r.closed,true);assert.equal(r.proposal,null);assert.equal(r.rsvp,'');
 await syncFeishuJob({desired:t,remote:r},client,'http://localhost',async()=>{});await observeFeishuJob({desired:t,remote:r},client);assert.equal(calls.length,1);
 const state=make(),external=state.applications[0].rounds[0];external.calendarSource='external';for(const patch of [{time:'2026-10-29T15:00',location:'https://example.com/new'},{cancelled:true}]){Object.assign(external,patch);assert.equal(feishuDesired(state,people,cfg,now).length,0);}
});
test('撤销失败保持失败可重试，不再创建或更新邀请',async()=>{
 const t={...task(make()),active:false,calendarSource:'external'},remote={eventId:'system-event',calendarId:'calendar',closed:false},before=structuredClone(remote),methods=[];
 const client={call:async(path,options)=>{methods.push(options.method);throw Error('network failure');}};await assert.rejects(syncFeishuJob({desired:t,remote},client,'http://localhost',async()=>{}),/network failure/);assert.deepEqual(methods,['DELETE']);assert.deepEqual(remote,before);
});
test('恢复系统同步后只生成一个稳定任务，使用新的创建键后续重试不会重复邀请',async()=>{
 const s=make(),oldTask={...task(s),active:false,calendarSource:'external'},old=existing(oldTask,{eventId:'old-event',calendarId:'calendar',closed:true});s.applications[0].rounds[0].calendarSource='system';const jobs=reconcileFeishuJobs(s,[old],feishuDesired(s,people,cfg,now),now);assert.equal(jobs.length,1);assert.equal(jobs[0].active,true);assert.equal(jobs[0].calendarSource,undefined);
 let creates=0;const client={call:async(path,options={})=>{if(options.method==='POST'&&path.includes('/events?')){creates++;return {event:{event_id:'new-event'}};}if(path.includes('/attendees?'))return {items:[{user_id:'ou_i',attendee_id:'a',rsvp_status:'accept'}]};return {};}};
 const remote=await syncFeishuJob({desired:jobs[0],remote:{...old.remote,createKey:'fresh-key'}},client,'http://localhost',async()=>{});await syncFeishuJob({desired:jobs[0],remote},client,'http://localhost',async()=>{});assert.equal(creates,1);assert.equal(remote.eventId,'new-event');
});
