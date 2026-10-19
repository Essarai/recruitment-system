import {test} from 'node:test';
import assert from 'node:assert/strict';
import {load,save} from '../src/repository.js';

test('附件上传完成后才保存记录，并显示实际保存阶段；上传失败不写入应聘',async()=>{
 const original=globalThis.fetch,calls=[],progress=[];
 const data={candidates:[],applications:[],revision:1};const resume={id:'private-file',name:'sample.pdf',type:'application/pdf'};
 let failUpload=false;
 globalThis.fetch=async(path,options={})=>{
  calls.push(path);
  if(options.method!=='POST')return Response.json({user:{role:'HR'},data});
  if(path.startsWith('/api/resumes?'))return Response.json(failUpload?{error:'上传失败'}:resume,{status:failUpload?503:201});
  const payload=JSON.parse(options.body);assert.deepEqual(payload.applications[0].resume,resume);return Response.json({...payload,revision:2});
 };
 try{
  await load();const next={...data,applications:[{resume:{file:new File(['%PDF-1.4'],'sample.pdf')}}]};
  await save(next,label=>progress.push(label));
  assert.deepEqual(progress,['正在上传简历…','正在保存记录…']);
  assert.deepEqual(calls,['/api/state','/api/resumes?name=sample.pdf','/api/state']);
  calls.length=0;failUpload=true;await assert.rejects(save(next),/上传失败/);
  assert.deepEqual(calls,['/api/resumes?name=sample.pdf']);
  assert.ok(next.applications[0].resume.file instanceof File,'失败后仍保留原始表单附件');
 }finally{globalThis.fetch=original;}
});

test('面评对话上传成功但保存失败时，重试复用同一附件，不重复上传',async()=>{
 const original=globalThis.fetch,stages=[];let uploads=0,patches=0;
 const data={revision:1,applications:[{id:'app',rounds:[{id:'round',feedback:{status:'none'}}]}]};
 globalThis.fetch=async(path,options={})=>{
  if(!options.method)return Response.json({user:{role:'interviewer'},data});
  if(path.includes('/transcript?')){uploads++;assert.ok(options.body instanceof File);return Response.json({id:'dialogue',name:'talk.txt'});}
  assert.equal(options.method,'PATCH');assert.deepEqual(JSON.parse(options.body).feedback.transcript,{id:'dialogue',name:'talk.txt'});
  patches++;return patches===1?Response.json({error:'暂时不可用'},{status:503}):Response.json({...data,revision:2});
 };
 try{
  await load();const next=structuredClone(data);next.applications[0].rounds[0].feedback={status:'draft',summary:'草稿',transcript:{file:new File(['Interviewer: test'],'talk.txt')}};
  await assert.rejects(save(next,label=>stages.push(label)),/暂时不可用/);await save(next);
  assert.equal(uploads,1);assert.equal(patches,2);assert.deepEqual(stages,['正在上传面试对话…','正在保存面评…']);
 }finally{globalThis.fetch=original;}
});

test('更新档案简历先上传再关联候选人，不变更应聘快照；复用旧简历不发上传请求',async()=>{
 const original=globalThis.fetch,calls=[],file={id:'new-file',name:'new.pdf',type:'application/pdf',size:9};
 const data={candidates:[{id:'c'}],applications:[{id:'old',resume:{id:'old-file'}}],revision:1};
 globalThis.fetch=async(path,options={})=>{calls.push(path);if(!options.method)return Response.json({user:{role:'HR'},data});if(path.startsWith('/api/resumes?'))return Response.json(file);return Response.json(JSON.parse(options.body));};
 try{
  await load();calls.length=0;const next={...data,candidates:[{id:'c',resumes:[{file:new File(['%PDF-1.4'],'new.pdf')}]}]};
  const saved=await save(next);assert.deepEqual(saved.candidates[0].resumes,[file]);assert.deepEqual(saved.applications,data.applications);assert.equal(next.candidates[0].resumes[0].file.name,'new.pdf');
  assert.deepEqual(calls,['/api/resumes?name=new.pdf','/api/state']);calls.length=0;
  await save({...saved,applications:[...saved.applications,{id:'recall',resume:{id:'old-file'}}]});assert.deepEqual(calls,['/api/state']);
 }finally{globalThis.fetch=original;}
});
test('版本未变只请求版本；业务或账号目录变化才拉正文，读取不提前修改保存基线',async()=>{
 const {readUpdates,acceptUpdate}=await import('../src/repository.js');const original=globalThis.fetch,calls=[];
 let revision=10,directory='one',sessionUserId='sync-user';const user={id:'sync-user',role:'HR'};
 globalThis.fetch=async(path,options={})=>{calls.push(path);if(path==='/api/state/version')return Response.json({revision,directoryVersion:directory,userId:sessionUserId});if(options.method==='POST'){const data=JSON.parse(options.body);assert.equal(data.revision,10);return Response.json({...data,revision:12});}return Response.json({user,data:{revision,candidates:[],applications:[]},directoryVersion:directory});};
 try{const initial=await load();calls.length=0;assert.equal(await readUpdates(),null);assert.deepEqual(calls,['/api/state/version']);
 revision=11;const update=await readUpdates();assert.equal(update.data.revision,11);await save(initial.data);assert.equal(acceptUpdate(update),false,'旧响应不能覆盖更新的本地保存结果');
 revision=12;directory='two';assert.ok(await readUpdates());const before=calls.length;await readUpdates({force:true});assert.deepEqual(calls.slice(before),['/api/state']);
 const newer=await readUpdates();assert.equal(acceptUpdate(newer),true);assert.equal(await readUpdates(),null);sessionUserId='other-account';await assert.rejects(readUpdates(),error=>error.status===401);
 }finally{globalThis.fetch=original;}
});
