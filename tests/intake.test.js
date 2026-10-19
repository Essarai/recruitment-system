import {test} from 'node:test';import assert from 'node:assert/strict';
import {applicationFromCandidate,candidateMatches,sameCandidateContact} from '../src/intake.js';
import {validateHRState} from '../server/validation.js';import {emptyState,visibleState} from '../server/database.js';
const file={id:'file',name:'resume.pdf',mime:'application/pdf',size:100};
const candidate={id:'c',name:'张三',phone:'13800138000',email:'person@example.com',education:'普本',resumes:[{id:file.id}]};
const template={id:'t',name:'产品经理',jd:'岗位职责',nodes:[{name:'初试',interviewer:'面试官'}]};
const data=()=>({candidates:[structuredClone(candidate)],templates:[structuredClone(template)],users:[{role:'interviewer',name:'面试官'}],applications:[]});
const selected={candidateId:'c',templateId:'t',resumeId:'file',reviewer:'面试官'};
test('独立入库无需流程或面试官，不产生应聘，面试官不可见未推送档案',()=>{
 const input=emptyState();input.candidates.push(structuredClone(candidate));const saved=validateHRState(emptyState(),input,[],[file],'HR');
 assert.equal(saved.candidates[0].resumes[0].id,'file');assert.equal(saved.applications.length,0);assert.equal(saved.templates.length,0);
 const view=visibleState(saved,{id:'i',role:'interviewer',name:'面试官'},[],1);assert.equal(view.candidates.length,0);
});
test('从已有档案创建应聘复用附件并快照流程，不修改档案或历史',()=>{
 const state=data(),before=structuredClone(state),app=applicationFromCandidate(state,selected,'HR');
 assert.deepEqual(state,before);assert.equal(app.candidateId,'c');assert.equal(app.resume.id,'file');assert.equal(app.job,'产品经理');assert.equal(app.jd,'岗位职责');assert.equal(app.screening.status,'pending');assert.equal(app.screening.interviewer,'面试官');assert.equal(app.rounds[0].time,'');
 app.resume.name='changed';assert.deepEqual(state,before);
 const previous=validateHRState(emptyState(),state,['面试官'],[file],'HR');const next=structuredClone(previous);next.applications.push(app);assert.equal(validateHRState(previous,next,['面试官'],[file],'HR').applications.length,1);
});
test('创建禁止正在应聘者及错误的候选人、简历、流程和冻结面试官；终止后可重新捞起历史简历',()=>{
 const state=data();state.applications=[{candidateId:'c',status:'进行中'}];assert.throws(()=>applicationFromCandidate(state,selected,'HR'),/进行中/);
 state.applications[0]={...state.applications[0],status:'未录用',resume:{id:'old',name:'history.pdf'},history:[]};state.candidates[0].resumes=[];
 assert.equal(applicationFromCandidate(state,{...selected,resumeId:'old'},'HR').resume.id,'old');
 for(const change of [{candidateId:'missing'},{templateId:'missing'},{resumeId:'other'},{reviewer:'其他人'}])assert.throws(()=>applicationFromCandidate(data(),{...selected,...change},'HR'));
 state.users[0].frozen=true;assert.throws(()=>applicationFromCandidate(state,{...selected,resumeId:'old'},'HR'),/确认人/);
});
test('手机号邮箱去重忽略空格及邮箱大小写，同名不同人可区分；服务端拒绝重复入库',()=>{
 assert.equal(candidateMatches([candidate],{name:'其他姓名',email:' PERSON@EXAMPLE.COM '}).length,1);assert.equal(sameCandidateContact(candidate,{email:' PERSON@EXAMPLE.COM '}),true);
 assert.equal(candidateMatches([candidate],{name:' 张三 '}).length,1);assert.equal(sameCandidateContact(candidate,{name:'张三',phone:'13900139000'}),false);
 assert.equal(candidateMatches([candidate],{...candidate}).length,0);
 const previous=validateHRState(emptyState(),{...emptyState(),candidates:[candidate]},[],[file],'HR');const next=structuredClone(previous);next.candidates.push({...candidate,id:'duplicate',name:'不同姓名'});assert.throws(()=>validateHRState(previous,next,[],[file],'HR'),/已存在/);
});
test('简历确认人可与一面默认面试官不同，不修改各轮分配',()=>{
 const state=data();state.users.push({role:'interviewer',name:'独立确认人'});state.templates[0].reviewer='独立确认人';
 const app=applicationFromCandidate(state,{...selected,reviewer:'独立确认人'},'HR');assert.equal(app.screening.interviewer,'独立确认人');assert.equal(app.rounds[0].interviewer,'面试官');
});
test('创建时确认人可留空，无面试官账号也可建应聘；跳过节点后可直接排期',async()=>{
 const {validateSchedule,applicationProgress,needsScreening,applicationStage}=await import('../src/model.js');
 const state=data();state.users=[];state.templates[0].reviewer='面试官';
 const app=applicationFromCandidate(state,{...selected,reviewer:''},'HR');assert.deepEqual(app.screening,{status:'skipped',interviewer:'',reason:''});assert.equal(needsScreening(app),false);
 assert.ok(!applicationProgress(app).some(step=>step.id==='screening'));assert.equal(applicationStage(app).name,'初试');
 const previous=validateHRState(emptyState(),state,['面试官'],[file],'HR'),input=structuredClone(previous);input.applications.push(app);
 const saved=validateHRState(previous,input,['面试官'],[file],'HR');assert.equal(saved.applications[0].screening.status,'skipped');
 const scheduled=structuredClone(saved);Object.assign(scheduled.applications[0].rounds[0],{interviewer:'面试官',time:'2026-10-22T10:00',location:'https://meeting.example.com/'});
 assert.doesNotThrow(()=>validateSchedule(app,app.rounds[0],scheduled.applications[0].rounds[0]));assert.equal(validateHRState(saved,scheduled,['面试官'],[file],'HR').applications[0].rounds[0].interviewer,'面试官');
 assert.equal(visibleState(saved,{role:'interviewer',name:'面试官'},[],1).applications.length,0);
 const pending=structuredClone(saved);pending.applications[0].screening={status:'pending',interviewer:'面试官',reason:''};const withReview=validateHRState(saved,pending,['面试官'],[file],'HR');
 const bypass=structuredClone(withReview);bypass.applications[0].screening={status:'skipped',interviewer:'',reason:''};assert.throws(()=>validateHRState(withReview,bypass,['面试官'],[file],'HR'),/不能代为接受/);
 delete bypass.applications[0].screening;assert.throws(()=>validateHRState(withReview,bypass,['面试官'],[file],'HR'));
});
