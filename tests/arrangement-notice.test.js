import {test} from 'node:test';import assert from 'node:assert/strict';
import {arrangementNotice,syncArrangementNotice} from '../server/arrangement-notice.js';
import {feishuDesired,reconcileFeishuJobs} from '../server/feishu-model.js';
const now=Date.parse('2099-11-08T01:00:00Z'),who={userId:'i',openId:'ou'},a={id:'a',candidateId:'c',job:'产品',status:'进行中',rounds:[]};
const make=()=>({id:'r',name:'初试',time:'2099-11-09T14:00',mode:'线上',location:'https://meeting.tencent.com/test',calendarSource:'external',interviewer:'甲',duration:60,feedback:{status:'none'},scheduleEvents:[{type:'created',at:'2099-11-08T00:00:00Z'}]});
test('外部会议只发消息不建日程；待确认无排期不发，历史安排不补发',()=>{
 const r=make(),state={candidates:[{id:'c',name:'候选人'}],applications:[{...a,rounds:[r]}]},config={backfill:true,calendarId:'cal',bindings:{i:'ou'}},people=[{id:'i',name:'甲',role:'interviewer'}];
 assert.equal(feishuDesired(state,people,config,now).filter(t=>t.kind==='round').length,0);assert.equal(feishuDesired(state,people,config,now).filter(t=>t.kind==='notice').length,1);
 assert.equal(arrangementNotice(a,{...r,time:'',pendingArrangement:{time:r.time}},who,'候选人',now),null);
 assert.equal(arrangementNotice(a,{...r,scheduleEvents:[{at:'2026-10-01T00:00:00Z'}]},who,'候选人',now),null);
 r.calendarSource='system';assert.equal(feishuDesired(state,people,config,now).filter(t=>['round','notice'].includes(t.kind)).length,2);
});
test('机器人发送独立于日程接口，重试去重，改期更新旧卡片并新发，取消单独通知',async()=>{
 const calls=[],client={call:async(path,options)=>{calls.push({path,options});return {message_id:'message-'+calls.length};}},t=arrangementNotice(a,make(),who,'候选人',now),j={id:t.id,desired:t,remote:{}};
 j.remote=await syncArrangementNotice(j,client,'https://example.com',async()=>{});assert.equal(calls.length,1);assert.ok(calls[0].path.startsWith('/im/'));assert.match(calls[0].options.body.content,/meeting.tencent.com/);
 await syncArrangementNotice(j,client,'https://example.com',async()=>{});assert.equal(calls.length,1);
 j.desired={...t,time:'2099-11-09T15:00',eventAt:'2099-11-08T00:01:00Z'};j.remote=await syncArrangementNotice(j,client,'https://example.com',async()=>{});assert.equal(calls[1].options.method,'PATCH');assert.equal(calls[2].options.method,'POST');
 j.desired={...j.desired,active:false};j.remote=await syncArrangementNotice(j,client,'https://example.com',async()=>{});assert.equal(j.remote.closed,true);assert.equal(calls.at(-1).options.method,'POST');
 const unbound={...j,desired:{...t,openId:''},remote:{}};await assert.rejects(syncArrangementNotice(unbound,client,'https://example.com',async()=>{}),/未绑定/);
});
