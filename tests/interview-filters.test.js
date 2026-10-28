import {test} from 'node:test';
import assert from 'node:assert/strict';
import {interviewGroups,filterInterviewGroups} from '../src/interview-groups.js';
const now=Date.parse('2026-10-28T12:00:00Z'),past='2026-10-27T10:00:00Z',future='2026-10-29T10:00:00Z';
const round=(id,patch={})=>({id,name:'初试',interviewer:'面试官',time:'',cancelled:false,feedback:{status:'none'},...patch});
const app=(id,patch={})=>({id,candidateId:id,job:'产品经理',status:'进行中',rounds:[],...patch});
function groupsFor(applications){return interviewGroups({candidates:[...new Set(applications.map(a=>a.candidateId))].map(id=>({id,name:'候选人'+id})),applications},'面试官','',now);}
const ids=(groups,filters)=>filterInterviewGroups(groups,filters,now).map(g=>g.candidate.id).sort();
test('支持本人相关的简历确认、需补充、待排期、待面试、欠评和已提交面评筛选',()=>{
 const groups=groupsFor([
  app('review',{screening:{interviewer:'面试官',status:'pending'}}),
  app('needs',{screening:{interviewer:'面试官',status:'needs_info'}}),
  app('schedule',{screening:{interviewer:'面试官',status:'accepted'}}),
  app('laterNeeds',{rounds:[round('r',{review:{interviewer:'面试官',status:'needs_info'}})]}),
  app('laterSchedule',{rounds:[round('r',{review:{interviewer:'面试官',status:'accepted'}})]}),
  app('future',{rounds:[round('r',{time:future})]}),
  app('due',{rounds:[round('r',{time:past})]}),
  app('draft',{rounds:[round('r',{time:future,feedback:{status:'draft'}})]}),
  app('submitted',{status:'未录用',rounds:[round('r',{time:past,feedback:{status:'submitted'}})]}),
  app('cancelled',{rounds:[round('r',{time:past,cancelled:true})]})
 ]);
 assert.deepEqual(ids(groups,{progress:'review'}),['review']);assert.deepEqual(ids(groups,{progress:'needs_info'}),['laterNeeds','needs']);assert.deepEqual(ids(groups,{progress:'schedule'}),['laterSchedule','schedule']);assert.deepEqual(ids(groups,{progress:'interview'}),['draft','future']);assert.deepEqual(ids(groups,{progress:'feedback'}),['draft','due']);assert.deepEqual(ids(groups,{progress:'submitted'}),['submitted']);
});
test('多个条件必须匹配同一次应聘和同一轮，不能拼接同一个人的不同应聘或不同轮次',()=>{
 const groups=groupsFor([
  app('old',{candidateId:'same',status:'公司决定录用',rounds:[round('first',{time:past,feedback:{status:'submitted'}})]}),
  app('new',{candidateId:'same',job:'工程师',rounds:[round('second',{name:'复试',review:{interviewer:'面试官',status:'pending'}})]})
 ]);
 assert.deepEqual(ids(groups,{job:'产品经理',result:'进行中'}),[]);assert.deepEqual(ids(groups,{job:'工程师',progress:'submitted'}),[]);assert.deepEqual(ids(groups,{round:'round:复试',progress:'submitted'}),[]);assert.deepEqual(ids(groups,{job:'产品经理',result:'已录用',round:'round:初试',progress:'submitted'}),['same']);
 const matched=filterInterviewGroups(groups,{job:'产品经理'},now);assert.equal(matched[0].applications.length,2,'命中候选人后仍可展开本人完整历史');
});
test('初始简历确认与实际面试轮次分开筛选，已结束审核不误计为待确认或待 HR 补充',()=>{
 const groups=groupsFor([app('initial',{screening:{status:'pending',interviewer:'面试官'},rounds:[round('named',{name:'初始简历确认',time:past,feedback:{status:'submitted'}})]}),app('ended',{status:'未录用',screening:{status:'needs_info',interviewer:'面试官'}})]);
 assert.deepEqual(ids(groups,{round:'screening',progress:'submitted'}),[]);assert.deepEqual(ids(groups,{round:'round:初始简历确认',progress:'submitted'}),['initial']);assert.deepEqual(ids(groups,{progress:'needs_info'}),[]);assert.deepEqual(ids(groups,{result:'流程终止'}),['ended']);
});
test('默认和清空恢复全部授权候选人，不修改历史、待办或其他视图的统计，支持空结果',()=>{
 const groups=groupsFor([app('active',{rounds:[round('r',{time:past})]}),app('ended',{status:'未录用',rounds:[round('r2',{time:past,feedback:{status:'submitted'}})]})]),before=structuredClone(groups);
 assert.deepEqual(ids(groups,{}),['active','ended']);assert.deepEqual(ids(groups,{job:'不存在'}),[]);assert.deepEqual(ids(groups,{progress:'unknown'}),[]);filterInterviewGroups(groups,{result:'流程终止'},now);assert.deepEqual(groups,before);assert.equal(groups[0].tasks.length,1);
});
test('姓名搜索可与筛选叠加，未授权的面试轮次不能使候选人命中',()=>{
 const data={candidates:[{id:'c',name:'测试姓名',phone:'13800138000'}],applications:[app('a',{candidateId:'c',rounds:[round('mine',{time:future}),round('other',{name:'他人复试',interviewer:'其他面试官',time:past,feedback:{status:'submitted'}})]})]};
 const groups=interviewGroups(data,'面试官','测试姓名',now);assert.deepEqual(ids(groups,{progress:'interview'}),['c']);assert.deepEqual(ids(groups,{round:'round:他人复试'}),[]);assert.deepEqual(ids(groups,{progress:'submitted'}),[]);assert.equal(interviewGroups(data,'面试官','无匹配',now).length,0);
});
