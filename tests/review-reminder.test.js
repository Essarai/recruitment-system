import {test} from 'node:test';import assert from 'node:assert/strict';
import {reviewReminderDue,remindResumeReview} from '../server/review-reminder.js';
import {syncFeishuJob} from '../server/feishu-worker.js';
const at=s=>Date.parse(s+'+08:00');
test('三个工作日保留北京时间时刻，跳过周末和跨月',()=>{
 for(const [sent,due] of [['2026-11-02T10:00','2026-11-05T10:00'],['2026-11-06T18:00','2026-11-11T18:00'],['2026-11-07T10:00','2026-11-11T10:00'],['2026-10-30T10:00','2026-11-04T10:00']])assert.equal(reviewReminderDue(sent+'+08:00'),at(due));assert.equal(reviewReminderDue(''),null);
});
const job=()=>({id:'review:a',desired:{kind:'review',active:true,openId:'ou',screeningAt:'2026-11-02T10:00:00+08:00',name:'候选人',job:'岗位',appId:'a'},remote:{messageId:'original'}});
test('审核超时只提醒一次，失败重试保持同一去重键，换人/重新送审重新计时',async()=>{
 const calls=[],client={call:async(path,body)=>{calls.push(body.body);return {message_id:'reminder'};}},j=job();
 await remindResumeReview(j,client,'https://example.com',at('2026-11-05T09:59'));assert.equal(calls.length,0);
 j.remote=await remindResumeReview(j,client,'https://example.com',at('2026-11-05T10:00'));assert.equal(calls.length,1);assert.equal(calls[0].receive_id,'ou');
 await remindResumeReview(j,client,'https://example.com',at('2026-11-06T10:00'));assert.equal(calls.length,1);
 const retry=job();await remindResumeReview(retry,client,'https://example.com',at('2026-11-05T10:00'));assert.equal(calls[0].uuid,calls[1].uuid);
 j.desired.screeningAt='2026-11-06T10:00:00+08:00';await remindResumeReview(j,client,'https://example.com',at('2026-11-09T10:00'));assert.equal(calls.length,2);
 j.remote=await remindResumeReview(j,client,'https://example.com',at('2026-11-11T10:00'));assert.equal(calls.length,3);
});
test('已关闭、未绑定、周末不发提醒；失效提醒卡片同步关闭',async()=>{
 const calls=[],client={call:async(path,options)=>{calls.push({path,options});return {};}};
 for(const patch of [{active:false},{openId:''}]){const j=job();Object.assign(j.desired,patch);await remindResumeReview(j,client,'https://example.com',at('2026-11-06T10:00'));}
 await remindResumeReview(job(),client,'https://example.com',at('2026-11-07T10:00'));assert.equal(calls.length,0);
 const j=job();j.desired.active=false;j.remote={reminderMessageId:'reminder',reminderEpoch:j.desired.screeningAt,reminderOpenId:'ou'};await syncFeishuJob(j,client,'https://example.com',async()=>{});assert.equal(calls[0].options.method,'PATCH');assert.equal(calls.length,1);
});
