import {test} from 'node:test';import assert from 'node:assert/strict';
import {validateHRState} from '../server/validation.js';
import {applicationFromCandidate} from '../src/intake.js';
const hr={id:'hr',name:'HR甲',role:'HR'},admin={id:'admin',name:'管理员',role:'admin'};
const template={id:'t',name:'产品经理',jd:'岗位职责',nodes:[{name:'初试',interviewer:''}]};
const previous={candidates:[],applications:[],templates:[template]};
const validate=(before,input,actor)=>validateHRState(before,input,[],[],actor.name,[],actor);
test('HR cannot add, rename, change JD/reviewer/nodes, reorder or remove templates, including forged aggregate requests',()=>{
 for(const mutate of [s=>s.templates.push({...template,id:'t2'}),s=>s.templates[0].name='改名',s=>s.templates[0].jd='新JD',s=>s.templates[0].nodes.push({name:'复试',interviewer:''}),s=>s.templates[0].reviewer='甲',s=>s.templates=[]]){
  const input=structuredClone(previous);mutate(input);assert.throws(()=>validate(previous,input,hr),e=>e.status===403&&/仅管理员/.test(e.message));
 }
 const two={...previous,templates:[template,{...template,id:'t2'}]};assert.throws(()=>validate(two,{...two,templates:[...two.templates].reverse()},hr),/仅管理员/);
});
test('unchanged templates remain usable for HR and admin retains template maintenance',()=>{
 assert.deepEqual(validate(previous,structuredClone(previous),hr).templates,previous.templates);
 const input=structuredClone(previous);input.templates[0].name='高级产品经理';input.templates[0].jd='新JD';assert.equal(validate(previous,input,admin).templates[0].name,'高级产品经理');
 const blank={candidates:[],applications:[],templates:[]};assert.equal(validate(blank,previous,admin).templates.length,1);
});
test('HR can still create applications using existing templates without rewriting them',()=>{
 const file={id:'f',name:'简历.pdf',mime:'application/pdf',size:100};
 const candidate={id:'c',name:'候选人',phone:'13800138000',email:'test@example.com',age:'28',highestEducation:'本科',education:'普本',experience:'2',company:'公司',currentTitle:'产品经理',city:'杭州',notes:'已电话沟通，候选人对岗位意向明确，可两周内到岗，建议进入业务面试。',resumes:[{id:file.id,name:file.name,type:file.mime,size:100}]};
 const before={...structuredClone(previous),candidates:[candidate]};
 const app=applicationFromCandidate(before,{candidateId:'c',templateId:'t',resumeId:'f',reviewer:''},hr.name);
 const saved=validateHRState(before,{...before,applications:[app]},[],[file],hr.name,[],hr);
 assert.equal(saved.applications[0].createdBy,hr.id);assert.deepEqual(saved.templates,before.templates);
});
test('admin can delete the default or last template; other roles and unverified callers cannot delete',()=>{
 const before={...structuredClone(previous),templates:[template,{...template,id:'t2',name:'工程师'}]};
 const oneLeft=validate(before,{...before,templates:[before.templates[1]]},admin);assert.deepEqual(oneLeft.templates,[before.templates[1]]);
 assert.deepEqual(validate(oneLeft,{...oneLeft,templates:[]},admin).templates,[]);
 for(const actor of [hr,{id:'i',name:'面试官',role:'interviewer'}])assert.throws(()=>validate(before,{...before,templates:[]},actor));
 assert.throws(()=>validateHRState(before,{...before,templates:[]},[],[],'未验证调用'),/不能删除已有流程模板/);
});
test('deleting a used template preserves application snapshots, feedback and resume; existing applications remain editable',()=>{
 const file={id:'f',name:'简历.pdf',mime:'application/pdf',size:100};
 const candidate={id:'c',name:'候选人',phone:'13800138000',email:'test@example.com',age:'28',highestEducation:'本科',education:'普本',experience:'2',company:'公司',currentTitle:'产品经理',city:'杭州',notes:'已电话沟通，候选人对岗位意向明确，可两周内到岗，建议进入业务面试。',resumes:[{id:file.id,name:file.name,type:file.mime,size:100}]};
 const start={...structuredClone(previous),candidates:[candidate]},input={...start,applications:[applicationFromCandidate(start,{candidateId:'c',templateId:'t',resumeId:'f',reviewer:''},hr.name)]};
 const save=(before,next,actor=admin)=>validateHRState(before,next,[],[file],actor.name,[],actor);
 const before=save(start,input,hr);before.applications[0].rounds[0].feedback={status:'submitted',conclusion:'待定',summary:'保留的面评',submittedAt:'2026-10-27T00:00:00Z'};
 const deleted=save(before,{...structuredClone(before),templates:[]});assert.deepEqual(deleted.applications,before.applications);assert.deepEqual(deleted.candidates,before.candidates);assert.equal(deleted.applications[0].jd,template.jd);assert.equal(deleted.applications[0].templateId,template.id);
 assert.deepEqual(save(deleted,structuredClone(deleted),hr).applications,deleted.applications);
 const ended=structuredClone(deleted);ended.applications[0].status='公司决定录用';ended.applications[0].reason='评估后决定录用';assert.equal(save(deleted,ended,hr).applications[0].status,'公司决定录用');
});
test('deleted templates cannot create new applications, including a forged aggregate or a stale form',()=>{
 const file={id:'f',name:'简历.pdf',mime:'application/pdf',size:100};
 const candidate={id:'c',name:'候选人',phone:'13800138000',email:'test@example.com',education:'普本',notes:'已电话沟通，候选人对岗位意向明确，可两周内到岗，建议进入业务面试。',resumes:[{id:file.id,name:file.name,type:file.mime,size:100}]};
 const data={...structuredClone(previous),candidates:[candidate]},app=applicationFromCandidate(data,{candidateId:'c',templateId:'t',resumeId:'f',reviewer:''},hr.name),deleted={...data,templates:[]};
 assert.throws(()=>applicationFromCandidate(deleted,{candidateId:'c',templateId:'t',resumeId:'f',reviewer:''},hr.name),/请选择招聘流程/);
 assert.throws(()=>validateHRState(deleted,{...deleted,applications:[app]},[],[file],hr.name,[],hr),/应聘岗位必须来自所选流程名称/);
});
