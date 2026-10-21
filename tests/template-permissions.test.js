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
