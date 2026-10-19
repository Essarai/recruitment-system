import {test} from 'node:test';
import assert from 'node:assert/strict';
import {interviewGroups} from '../src/interview-groups.js';
import {visibleState} from '../server/database.js';
const now=Date.parse('2026-10-18T10:00:00Z');
const round=(id,person,time,status='none',cancelled=false)=>({id,interviewer:person,time,feedback:{status},cancelled});
test('同一候选人跨应聘跨轮次合为一条主记录；同名不同 ID 不合并，保留各自附件和轮次',()=>{
 const data={candidates:[{id:'c1',name:'同名'},{id:'c2',name:'同名'}],applications:[
  {id:'old',candidateId:'c1',status:'未录用',resume:{id:'old-file'},rounds:[round('r1','甲','2026-10-17','submitted'),round('private','乙','2026-10-17')]},
  {id:'new',candidateId:'c1',status:'进行中',resume:{id:'new-file'},screening:{interviewer:'甲',status:'pending'},rounds:[]},
  {id:'other-person',candidateId:'c2',status:'进行中',rounds:[round('r2','甲','2026-10-20')]}
 ]};
 const groups=interviewGroups(data,'甲','',now);assert.equal(groups.length,2);assert.equal(groups[0].candidate.id,'c1');assert.equal(groups[0].applications.length,2);assert.equal(groups[0].roundCount,1);assert.equal(groups[0].reviews,1);assert.equal(groups[0].feedback,0);assert.deepEqual(groups[0].applications.map(x=>x.app.resume.id),['old-file','new-file']);assert.deepEqual(groups[0].applications[0].rounds.map(r=>r.id),['r1']);
 assert.equal(groups[1].feedback,0);assert.equal(interviewGroups(data,'不存在','',now).length,0);
});
test('仅待确认和到期/退回欠评提示待处理；已取消、已提交、未来轮次不误计，搜索覆盖待确认记录',()=>{
 const data={candidates:[{id:'done',name:'历史',phone:'13800138000'},{id:'work',name:'待处理',email:'work@example.com'}],applications:[
  {id:'history',candidateId:'done',status:'候选人退出',rounds:[round('done','甲','2026-10-17','submitted')]},
  {id:'active',candidateId:'work',status:'进行中',rounds:[round('due','甲','2026-10-17'),round('future','甲','2026-10-20'),round('cancelled','甲','2026-10-17','none',true),round('returned','甲','2026-10-20','returned')]}
 ]};
 const groups=interviewGroups(data,'甲','',now);assert.equal(groups[0].candidate.id,'work');assert.equal(groups[0].feedback,2);assert.equal(groups[0].roundCount,4);assert.equal(interviewGroups(data,'甲','WORK@EXAMPLE',now).length,1);assert.equal(interviewGroups(data,'甲','missing',now).length,0);
 data.applications[1]={id:'waiting',candidateId:'work',status:'进行中',screening:{status:'accepted',interviewer:'甲'},rounds:[]};
 const waiting=interviewGroups(data,'甲','待处理',now)[0];assert.equal(waiting.reviews,0);assert.equal(waiting.waiting,1);assert.equal(waiting.applications[0].screening,true);assert.equal(waiting.roundCount,0);
});

test('待办有明确应聘/轮次目标，草稿无需等到排期结束；未来安排与 HR 待排期不混入待办',()=>{
 const data={candidates:[{id:'c',name:'候选人'}],applications:[
  {id:'review',candidateId:'c',status:'进行中',screening:{interviewer:'甲',status:'pending'},rounds:[]},
  {id:'scheduled',candidateId:'c',status:'进行中',rounds:[round('due','甲','2026-10-17'),round('draft','甲','2026-10-20','draft'),round('future','甲','2026-10-21'),round('done','甲','2026-10-17','submitted'),round('cancelled','甲','2026-10-17','none',true)]},
  {id:'waiting',candidateId:'c',status:'进行中',screening:{interviewer:'甲',status:'accepted'},rounds:[]},
  {id:'ended',candidateId:'c',status:'未录用',rounds:[round('ended-future','甲','2026-10-20')]}
 ]};
 const [g]=interviewGroups(data,'甲','',now);assert.equal(g.tasks.length,3);assert.deepEqual(g.tasks.map(t=>[t.kind,t.app.id,t.round?.id]),[['screening','review',undefined],['feedback','scheduled','due'],['feedback','scheduled','draft']]);assert.deepEqual(g.upcoming.map(t=>t.round.id),['draft','future']);assert.equal(g.reviews,1);assert.equal(g.feedback,2);assert.equal(g.waiting,1);
});
test('独立确认人在其他人开始面试后仍可查看确认记录，不产生重复待办',()=>{
 const data={candidates:[{id:'c',name:'候选人'}],applications:[{id:'a',candidateId:'c',status:'进行中',screening:{interviewer:'确认人',status:'accepted'},rounds:[round('first','一面面试官','2026-10-21')]}]};
 const [review]=interviewGroups(data,'确认人','',now);assert.equal(review.applications[0].screening,true);assert.equal(review.tasks.length,0);assert.equal(review.waiting,0);assert.equal(review.roundCount,0);
 const [first]=interviewGroups(data,'一面面试官','',now);assert.equal(first.applications[0].screening,false);assert.equal(first.roundCount,1);
});


test('即将面试保留至计划时间后 1 小时，到期移出但保留待交面评和完整记录',()=>{
 const start=Date.parse('2026-10-19T10:00:00Z');
 const data={candidates:[{id:'c',name:'候选人'}],applications:[{id:'a',candidateId:'c',status:'进行中',rounds:[round('r','甲',new Date(start).toISOString())]}]};
 for(const at of [start-1,start,start+3600000-1])assert.equal(interviewGroups(data,'甲','',at)[0].upcoming.length,1);
 for(const at of [start+3600000,start+3600001]){const [g]=interviewGroups(data,'甲','',at);assert.equal(g.upcoming.length,0);assert.equal(g.feedback,1);assert.equal(g.roundCount,1);assert.equal(g.applications[0].rounds[0].feedback.status,'none');}
 data.applications[0].rounds[0].feedback.status='submitted';assert.equal(interviewGroups(data,'甲','',start)[0].upcoming.length,0);
 data.applications[0].rounds[0].feedback.status='none';data.applications[0].rounds[0].cancelled=true;assert.equal(interviewGroups(data,'甲','',start)[0].upcoming.length,0);
});


test('确认人可见首轮已排期摘要，但不泄露其他面试官安排或面评',()=>{
 const data={candidates:[{id:'c',name:'候选人'}],applications:[{id:'a',candidateId:'c',status:'进行中',screening:{status:'accepted',interviewer:'确认人'},rounds:[round('first','其他面试官','2026-10-20T10:00')]}]};
 const safe=visibleState(data,{name:'确认人',role:'interviewer'},[],1);
 assert.equal(safe.applications[0].screening.firstInterviewScheduled,true);assert.equal(safe.applications[0].screening.interviewsScheduled,true);assert.deepEqual(safe.applications[0].rounds,[]);
 const [g]=interviewGroups(safe,'确认人','',now);assert.equal(g.waiting,0);assert.equal(g.tasks.length,0);
 data.applications[0].rounds[0].cancelled=true;assert.equal(visibleState(data,{name:'确认人',role:'interviewer'},[],1).applications[0].screening.firstInterviewScheduled,false);
});


test('确认人得到完整流程的安全阶段摘要，不因过滤他人轮次而只显示简历确认',()=>{
 const data={candidates:[{id:'c',name:'候选人'}],applications:[{id:'a',candidateId:'c',status:'进行中',screening:{status:'accepted',interviewer:'确认人'},rounds:[{...round('first','其他面试官','2099-10-20T10:00'),name:'一面',feedback:{status:'none',summary:'私有评价'}}]}]};
 const safe=visibleState(data,{name:'确认人',role:'interviewer'},[],1),app=safe.applications[0];
 assert.equal(app.progress.name,'一面');assert.match(app.progress.detail,/待面试/);assert.deepEqual(Object.keys(app.progress).sort(),['detail','name','tone']);assert.deepEqual(app.rounds,[]);assert.ok(!JSON.stringify(app).includes('私有评价'));
 data.applications[0].status='未录用';data.applications[0].reason='HR 私有原因';data.applications[0].rounds.push({...round('own','确认人','2099-10-20T10:00'),name:'二面'});
 const ended=visibleState(data,{name:'确认人',role:'interviewer'},[],1).applications[0];assert.equal(ended.progress.name,'流程终止');assert.ok(!JSON.stringify(ended).includes('HR 私有原因'));
});
