import {test} from 'node:test';
import assert from 'node:assert/strict';
import {applicationPhase} from '../src/application-phase.js';
import {round} from '../src/model.js';
test('进行中节点区分确认、补充、排期、面试、面评与决策，特殊面试直接待面评',()=>{
 const a={status:'进行中',screening:{status:'pending',interviewer:'甲'},rounds:[{...round('初试'),id:'r'}]},now=Date.parse('2026-11-06T10:00:00+08:00');
 assert.equal(applicationPhase(a,now),'review');a.screening.status='needs_info';assert.equal(applicationPhase(a,now),'supplement');a.screening.status='accepted';assert.equal(applicationPhase(a,now),'schedule');
 Object.assign(a.rounds[0],{time:'2026-11-06T11:00',interviewer:'甲'});assert.equal(applicationPhase(a,now),'interview');a.rounds[0].feedback.status='draft';assert.equal(applicationPhase(a,now),'feedback');a.rounds[0].feedback.status='none';a.rounds[0].time='2026-11-06T09:00';assert.equal(applicationPhase(a,now),'feedback');
 Object.assign(a.rounds[0],{time:'',mode:'特殊',specialRecordedAt:new Date(now).toISOString()});assert.equal(applicationPhase(a,now),'feedback');a.rounds[0].feedback={status:'submitted',conclusion:'待定'};assert.equal(applicationPhase(a,now),'decision');a.rounds[0].feedback.conclusion='建议通过';assert.equal(applicationPhase(a,now),'decision');
 a.rounds.push({...round('复试'),review:{status:'pending',interviewer:'乙'}});assert.equal(applicationPhase(a,now),'review');a.rounds[1].review.status='needs_info';assert.equal(applicationPhase(a,now),'supplement');a.rounds[1].review.status='accepted';assert.equal(applicationPhase(a,now),'schedule');a.status='未录用';assert.equal(applicationPhase(a,now),'');
});
