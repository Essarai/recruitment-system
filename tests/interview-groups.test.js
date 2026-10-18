import {test} from 'node:test';
import assert from 'node:assert/strict';
import {interviewGroups} from '../src/interview-groups.js';
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
