import {test} from 'node:test';import assert from 'node:assert/strict';
import {candidateSummary,compactCandidates,mergePartialCandidates,resumeSearchSQL,mountResumeLibrary,searchResumeLibrary} from '../server/resume-library.js';
import {validateHRState} from '../server/validation.js';
const candidate={id:'a',name:'测试',phone:'13800138000',email:'sample@example.com',age:'28',highestEducation:'硕士',education:'双非硕',experience:'2',company:'阿里',currentTitle:'产品经理',city:'杭州',notes:'供应链经验',resumes:[{id:'old',name:'旧简历.pdf'}],createdBy:'hr',createdAt:'2026-10-01T00:00:00Z'};
test('轻量加载不包含未关联档案及完整资料，指定档案才返回完整资料',()=>{
 const state={candidates:[candidate,{...candidate,id:'b'}],applications:[{candidateId:'a'}],revision:2},compact=compactCandidates(state);
 assert.equal(compact.partialCandidates,true);assert.equal(compact.candidateTotal,2);assert.deepEqual(compact.candidates,[candidateSummary(candidate)]);assert.equal(compact.candidates[0].notes,undefined);assert.equal(compact.candidates[0].resumes,undefined);
 const loaded=compactCandidates(state,['b']);assert.deepEqual(loaded.candidates.find(c=>c.id==='b'),state.candidates[1]);assert.equal(state.candidates[0].notes,'供应链经验');
});
test('部分候选人保存不会删除未加载档案、附件或归属；摘要不可被当成完整档案编辑',()=>{
 const previous={candidates:[candidate,{...candidate,id:'b',notes:'不能被覆盖'}],applications:[],templates:[]};
 const input={partialCandidates:true,candidates:[candidateSummary(candidate)],applications:[],templates:[]};const merged=mergePartialCandidates(previous,input);
 assert.deepEqual(merged.candidates,previous.candidates);assert.deepEqual(validateHRState(previous,merged,[],[],'HR'),previous);
 const changed=mergePartialCandidates(previous,{...input,candidates:[{...candidate,notes:'已更新'}]});assert.equal(changed.candidates[0].notes,'已更新');assert.equal(changed.candidates[1].notes,'不能被覆盖');assert.equal(changed.candidates[0].resumes[0].id,'old');
 assert.throws(()=>mergePartialCandidates(previous,{...input,candidates:[{...candidateSummary(candidate),name:'伪造修改'}]}),/完整资料/);assert.throws(()=>mergePartialCandidates(previous,{...input,candidates:[candidateSummary(candidate),candidateSummary(candidate)]}),/重复/);
});
test('SQL 搜索保留 AND 及独立年限语义，所有关键词和数值都绑定参数',()=>{
 const sql=resumeSearchSQL("阿里 + 供应链 + 2年以上");assert.deepEqual(sql.params,['%阿里%','%供应链%',2,1e308]);assert.ok(sql.cte.includes("$.notes"));assert.ok(sql.cte.includes('exp_low >= ? AND exp_high <= ?'));assert.ok(!sql.cte.includes('供应链'));assert.deepEqual(resumeSearchSQL('>=2年').params,[2]);
 assert.deepEqual(resumeSearchSQL('100%_!').params,['%100!%!_!!%']);assert.ok(!resumeSearchSQL("'OR1=1").cte.includes("'or1=1"));assert.throws(()=>resumeSearchSQL('a'.repeat(501)),e=>e.status===400);
});
test('简历库与档案接口拒绝面试官且不访问数据库',async()=>{
 const handlers=new Map();let accessed=0;mountResumeLibrary({get:(path,fn)=>handlers.set(path,fn)},{pool:{query(){accessed++;},getConnection(){accessed++;}}});
 for(const fn of handlers.values()){let status;await fn({user:{role:'interviewer'},query:{},params:{id:'a'}},{status(n){status=n;return this;},json(){}});assert.equal(status,403);}assert.equal(accessed,0);
});
test('万份未改动候选人可安全保留，部分保存不受旧的五千条候选人上限影响',()=>{
 const candidates=Array.from({length:10000},(_,i)=>({id:String(i),name:'历史候选人'+i})),previous={candidates,applications:[],templates:[]};
 const input=mergePartialCandidates(previous,{partialCandidates:true,candidates:[],applications:[],templates:[]});const result=validateHRState(previous,input,[],[],'HR');assert.equal(result.candidates.length,10000);assert.deepEqual(result.candidates[9999],candidates[9999]);
});

test('分页返回只含所需摘要，绝不通过当前阶段泄露未提交面评；超出页数自动校正',async()=>{
 const calls=[];let commit=false,released=false;const conn={beginTransaction:async()=>{},commit:async()=>{commit=true;},rollback:async()=>{},release:()=>{released=true;},query:async(sql,params)=>{calls.push({sql,params});if(sql.includes('COUNT(*) AS total'))return [[{total:25,libraryTotal:10000}]];if(sql.includes('SELECT profile,revision'))return [[{profile:candidate,revision:4}]];if(sql.includes('SELECT j.app'))return [[{app:{id:'app',candidateId:'a',job:'产品经理',status:'进行中',screening:{status:'skipped'},rounds:[{id:'r',name:'初试',time:'2026-10-01T10:00',feedback:{status:'draft',summary:'绝对不可泄露的草稿'}}]}}]];return [[{revision:4}]];}};
 const result=await searchResumeLibrary({getConnection:async()=>conn},{q:'供应链',page:999,size:20});assert.equal(result.page,2);assert.equal(result.pages,2);assert.equal(result.total,25);assert.equal(result.libraryTotal,10000);assert.equal(result.items[0].active,true);assert.equal(result.items[0].stage.round,undefined);assert.ok(!JSON.stringify(result).includes('绝对不可泄露'));assert.deepEqual(calls.find(c=>c.sql.includes('SELECT profile,revision')).params,['%供应链%',20,20]);assert.ok(commit&&released);
 for(const query of [{page:0},{page:1.5},{size:10000}])await assert.rejects(searchResumeLibrary({getConnection:()=>{throw Error('should not access');}},query),e=>e.status===400);
});
