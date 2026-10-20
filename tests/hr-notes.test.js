import {test} from 'node:test';import assert from 'node:assert/strict';
import {hrNotesLength,validateHRNotes,round} from '../src/model.js';
import {applicationFromCandidate} from '../src/intake.js';
import {validateHRState} from '../server/validation.js';
import {visibleState} from '../server/database.js';
const file={id:'f',name:'cv.pdf',mime:'application/pdf',size:100};
const c={id:'c',name:'测试',phone:'13800138000',email:'test@example.com',age:'28',highestEducation:'本科',education:'普本',experience:'2',company:'示例公司',currentTitle:'产品经理',city:'杭州',notes:'已沟通',resumes:[{id:'f',name:file.name,type:file.mime,size:100}]};
const template={id:'t',name:'产品经理',nodes:[{name:'初试',interviewer:''}]};
const data=()=>({candidates:[structuredClone(c)],applications:[],templates:[structuredClone(template)],users:[]});
const valid='已与候选人电话沟通，意向产品岗位，预计两周内到岗，建议安排业务初试。';
test('HR沟通备注按非空白字符计数，校验20–500字及边界，空格不能凑字数',()=>{
 for(const text of ['', '无','已沟通','待沟通','沟通'+ ' '.repeat(100), '字'.repeat(19),'字'.repeat(501)])assert.throws(()=>validateHRNotes(text),/20|500/);
 for(const n of [20,500])assert.equal(hrNotesLength(validateHRNotes('字'.repeat(n))),n);assert.equal(hrNotesLength(' 沟 通\n记录\t😀 '),5);assert.equal(validateHRNotes('  '+valid+'  '),valid);assert.equal(hrNotesLength('字 '.repeat(20)),20);assert.equal(validateHRNotes('字 '.repeat(20)).replace(/\s/g,'').length,20);
});
test('创建应聘前前后端均要求补充沟通记录，补充后可复用原简历创建',()=>{
 const previous=data(),options={candidateId:'c',templateId:'t',resumeId:'f',reviewer:''};assert.throws(()=>applicationFromCandidate(previous,options,'HR'),/前置沟通/);
 const next=structuredClone(previous);next.applications=[{id:'a',candidateId:'c',templateId:'t',job:template.name,status:'进行中',reason:'',resume:{id:'f'},screening:{status:'skipped',interviewer:''},history:[],rounds:[round('初试')]}];assert.throws(()=>validateHRState(previous,next,[],[file],'HR'),/前置沟通/);
 previous.candidates[0].notes=valid;const application=applicationFromCandidate(previous,options,'HR');const saved=validateHRState(previous,{...previous,applications:[application]},[],[file],'HR');assert.equal(saved.applications[0].resume.id,'f');assert.equal(saved.candidates[0].notes,valid);
});
test('旧记录未编辑及继续面试不受短备注影响，编辑资料或新增档案需要完整沟通记录',()=>{
 const old=data();old.applications=[{id:'a',candidateId:'c',templateId:'t',job:template.name,status:'进行中',reason:'',resume:{id:'f',name:file.name,type:file.mime,size:100},screening:{status:'skipped',interviewer:'',reason:''},history:[],rounds:[round('初试')]}];
 const view=visibleState(old,{role:'HR'},[],1);assert.equal(validateHRState(old,view,[],[file],'HR').candidates[0].notes,'已沟通');
 const edited=structuredClone(view);edited.candidates[0].city='上海';assert.throws(()=>validateHRState(old,edited,[],[file],'HR'),/前置沟通/);
 const fresh=data();assert.throws(()=>validateHRState({candidates:[],applications:[],templates:[]},fresh,[],[file],'HR'),/前置沟通/);fresh.candidates[0].notes=valid;assert.equal(validateHRState({candidates:[],applications:[],templates:[]},fresh,[],[file],'HR').candidates.length,1);
});
