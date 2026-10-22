import {test} from 'node:test';
import assert from 'node:assert/strict';
import {feishuEnvironment} from '../server/feishu-client.js';
import {feishuDesired,eventBody,scheduleSignature} from '../server/feishu-model.js';
import {syncFeishuJob,observeFeishuJob} from '../server/feishu-worker.js';
import {validateFeishuConfig} from '../server/feishu-routes.js';
const origin='http://localhost:4173',start=Date.parse('2026-10-23T10:00:00+08:00');
const task={id:'round:a:r',kind:'round',appId:'a',roundId:'r',active:true,userId:'self',openId:'ou_self',calendarId:'calendar',title:'测试面试',name:'测试候选人',job:'测试岗位',start,end:start+3600000,mode:'线上',location:'https://meeting.example',allowAttendeeEdit:true};
test('local polling needs app credentials and loopback origin, production enforces HTTPS; callbacks remain separately gated',()=>{
 const env={FEISHU_APP_ID:'app',FEISHU_APP_SECRET:'secret',PUBLIC_ORIGIN:origin};assert.equal(feishuEnvironment(env).ready,true);assert.equal(feishuEnvironment(env).eventsReady,false);assert.equal(feishuEnvironment({...env,NODE_ENV:'production'}).ready,false);assert.equal(feishuEnvironment({...env,PUBLIC_ORIGIN:'http://external.example'}).ready,false);
});
test('desired jobs use self bindings and pilot scope, omit completed/cancelled past work and do not mutate business records',()=>{
 const state={candidates:[{id:'c',name:'测试'}],applications:[{id:'a',candidateId:'c',job:'岗位',status:'进行中',history:[{action:'创建应聘',at:'2026-10-22T00:00:00Z'}],rounds:[{id:'r',interviewer:'本人',time:'2026-10-23T10:00:00+08:00',location:task.location,feedback:{status:'none'}},{id:'other',interviewer:'他人',time:'2026-10-23T12:00:00+08:00',feedback:{status:'none'}}]}]};
 const before=structuredClone(state),people=[{id:'self',name:'本人',role:'interviewer'},{id:'other',name:'他人',role:'interviewer'}],config={calendarId:'calendar',bindings:{self:'ou_self',other:'ou_other'},backfill:true,pilotUserId:'self'};
 assert.deepEqual(feishuDesired(state,people,config,start-1000).map(t=>t.openId),['ou_self']);assert.deepEqual(state,before);
 state.applications[0].rounds[0].feedback.status='submitted';assert.equal(feishuDesired(state,people,config,start-1000).length,0);
});
test('calendar invitation retries retain created event checkpoint and never create duplicate events',async()=>{
 let remote={createKey:'idempotent-key'},creates=0,fail=true;
 const client={call:async(path,options={})=>{
  if(options.method==='POST'&&path.includes('/events?')){creates++;assert.ok(path.includes('idempotency_key='));assert.equal(options.body.attendee_ability,'can_modify_event');return {event:{event_id:'event'}};}
  if(path.endsWith('page_size=100'))return {items:[]};
  if(path.includes('/attendees?')&&options.method==='POST'){if(fail)throw Error('temporary');return {attendees:[{user_id:'ou_self',attendee_id:'attendee',rsvp_status:'needs_action'}]};}
  return {};
 }};
 const checkpoint=async value=>{remote=structuredClone(value);};
 await assert.rejects(syncFeishuJob({desired:task,remote},client,origin,checkpoint),/temporary/);assert.equal(remote.eventId,'event');
 fail=false;remote=await syncFeishuJob({desired:task,remote},client,origin,checkpoint);assert.equal(creates,1);assert.equal(remote.rsvp,'needs_action');
});
test('RSVP and external reschedule create a proposal without changing canonical schedule or submitting feedback',async()=>{
 const job={desired:structuredClone(task),desired_hash:'base',remote:{eventId:'event',calendarId:'calendar',schedule:scheduleSignature(task)}};
 const previous=structuredClone(job);
 const client={call:async path=>path.includes('/attendees?')?{items:[{user_id:'ou_self',rsvp_status:'decline'}]}:{event:{start_time:{timestamp:String(start/1000+1800)},end_time:{timestamp:String(start/1000+5400)},location:{name:task.location}}}};
 const result=await observeFeishuJob(job,client);assert.equal(result.rsvp,'decline');assert.equal(result.proposal.baseHash,'base');assert.equal(result.proposal.start,start+1800000);assert.deepEqual(job,previous);
});
test('cancel propagates once; no invitation is sent for a missing binding',async()=>{
 const calls=[],client={call:async(path,options)=>{calls.push(options.method);return {};}};
 const remote=await syncFeishuJob({desired:{...task,active:false},remote:{eventId:'event',calendarId:'calendar',openId:'ou_self'}},client,origin,async()=>{});assert.equal(remote.closed,true);assert.deepEqual(calls,['DELETE']);
 await syncFeishuJob({desired:{...task,active:false},remote},client,origin,async()=>{});assert.equal(calls.length,1);
 await assert.rejects(syncFeishuJob({desired:{...task,openId:''},remote:{}},client,origin,async()=>{}),/尚未绑定/);
});
test('review acceptance expires the notification and reassignment/new review sends a fresh card',async()=>{
 const calls=[],client={call:async(path,options)=>{calls.push(options.method);return {message_id:'new'};}};
 const old={messageId:'old',openId:'ou_self',reviewEpoch:'old',uuid:'new-uuid'};
 const result=await syncFeishuJob({desired:{...task,kind:'review',screeningAt:'new'},remote:old},client,origin,async()=>{});assert.deepEqual(calls,['PATCH','POST']);assert.equal(result.reviewEpoch,'new');
 calls.length=0;await syncFeishuJob({desired:{...task,kind:'review',active:false},remote:result},client,origin,async()=>{});assert.deepEqual(calls,['PATCH']);
});
test('config cannot forge OAuth binding identities and preserves existing calendar association',()=>{
 const old={calendarId:'calendar',bindings:{self:'ou_self'},enabledAt:null};const config=validateFeishuConfig({enabled:true,allowAttendeeEdit:true,calendarId:'calendar',bindings:{self:'ou_attacker'}},[],old,true);assert.deepEqual(config.bindings,old.bindings);
 assert.throws(()=>validateFeishuConfig({enabled:true,allowAttendeeEdit:false,calendarId:'other'},[],old,true),/不支持直接切换/);
 const body=eventBody(task,origin);assert.equal(body.visibility,'private');assert.equal(body.start_time.timezone,'Asia/Shanghai');
});

test('single-account pilot persists when environment scope is absent; administrator scope rejects inactive/non-interviewers',()=>{
 const people=[{id:'self',role:'interviewer',frozen:false}],old={calendarId:'calendar',bindings:{self:'ou_self'},pilotUserId:'self'};
 const base={enabled:true,allowAttendeeEdit:true,calendarId:'calendar'};
 assert.equal(validateFeishuConfig(base,people,old,true).pilotUserId,'self');
 assert.equal(validateFeishuConfig({...base,pilotUserId:''},people,old,true).pilotUserId,'');
 assert.throws(()=>validateFeishuConfig({...base,pilotUserId:'missing'},people,old,true),/有效的试用面试官/);
 assert.throws(()=>validateFeishuConfig(base,[{...people[0],frozen:true}],old,true),/有效的试用面试官/);
});
