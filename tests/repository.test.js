import {test} from 'node:test';
import assert from 'node:assert/strict';
import {load,save} from '../src/repository.js';
import {mergeStateChanges} from '../server/state-changes.js';

test('附件上传完成后才保存记录，并显示实际保存阶段；上传失败不写入应聘',async()=>{
 const original=globalThis.fetch,calls=[],progress=[];
 const data={candidates:[],applications:[],revision:1};const resume={id:'private-file',name:'sample.pdf',type:'application/pdf'};
 let failUpload=false;
 globalThis.fetch=async(path,options={})=>{
  calls.push(path);
  if(options.method!=='POST')return Response.json({user:{role:'HR'},data});
  if(path.startsWith('/api/resumes?'))return Response.json(failUpload?{error:'上传失败'}:resume,{status:failUpload?503:201});
  const payload=JSON.parse(options.body);assert.deepEqual(payload.changes.applications[0].after.resume,resume);return Response.json({...data,applications:[payload.changes.applications[0].after],revision:2});
 };
 try{
  await load();const next={...data,applications:[{id:'app',resume:{file:new File(['%PDF-1.4'],'sample.pdf')}}]};
  await save(next,label=>progress.push(label));
  assert.deepEqual(progress,['正在上传简历…','正在保存记录…']);
  assert.deepEqual(calls,['/api/state?compact=1','/api/resumes?name=sample.pdf','/api/state']);
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
 const data={candidates:[{id:'c'}],applications:[{id:'old',resume:{id:'old-file'}}],templates:[],revision:1};let stored=structuredClone(data);
 globalThis.fetch=async(path,options={})=>{calls.push(path);if(!options.method)return Response.json({user:{role:'HR'},data});if(path.startsWith('/api/resumes?'))return Response.json(file);stored={...mergeStateChanges(stored,stored,JSON.parse(options.body).changes),revision:stored.revision+1};return Response.json(stored);};
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
 globalThis.fetch=async(path,options={})=>{calls.push(path);if(path==='/api/state/version')return Response.json({revision,directoryVersion:directory,userId:sessionUserId});if(options.method==='POST'){const data=JSON.parse(options.body);assert.equal(data.revision,10);return Response.json({candidates:[],applications:[],revision:12});}return Response.json({user,data:{revision,candidates:[],applications:[]},directoryVersion:directory});};
 try{const initial=await load();calls.length=0;assert.equal(await readUpdates(),null);assert.deepEqual(calls,['/api/state/version']);
 revision=11;const update=await readUpdates();assert.equal(update.data.revision,11);await save(initial.data);assert.equal(acceptUpdate(update),false,'旧响应不能覆盖更新的本地保存结果');
 revision=12;directory='two';assert.ok(await readUpdates());const before=calls.length;await readUpdates({force:true});assert.deepEqual(calls.slice(before),['/api/state?compact=1']);
 const newer=await readUpdates();assert.equal(acceptUpdate(newer),true);assert.equal(await readUpdates(),null);sessionUserId='other-account';await assert.rejects(readUpdates(),error=>error.status===401);
 }finally{globalThis.fetch=original;}
});


test('保存明确指定的当前面评，不因其他记录或字段顺序变化误判，允许覆盖同一草稿',async()=>{
 const original=globalThis.fetch;let patches=0;
 const data={revision:5,applications:[{id:'app',rounds:[{id:'target',feedback:{status:'returned',summary:'原内容'}},{id:'other',feedback:{status:'draft',summary:'其他内容'}}]}]};
 globalThis.fetch=async(path,options={})=>{if(!options.method)return Response.json({user:{role:'interviewer'},data});assert.equal(path,'/api/applications/app/rounds/target/feedback');const body=JSON.parse(options.body);assert.equal(body.feedback.summary,'覆盖后的内容');assert.equal(body.draft,true);patches++;return Response.json({...data,revision:5+patches});};
 try{await load();const next=structuredClone(data);next.applications[0].rounds[0].feedback.summary='覆盖后的内容';next.applications[0].rounds[1].feedback.summary='不应随本次保存写入';await save(next,()=>{},{appId:'app',roundId:'target'});await save(next,()=>{},{appId:'app',roundId:'target'});assert.equal(patches,2);}finally{globalThis.fetch=original;}
});

test('按需读取完整档案，自动同步保留已加载 ID，过期详情不会覆盖当前基线',async()=>{
 const {loadCandidate,readUpdates}=await import('../src/repository.js'),original=globalThis.fetch,calls=[];let revision=2;
 const summary={id:'a',name:'候选人',_summary:true};
 globalThis.fetch=async path=>{calls.push(path);if(path.startsWith('/api/candidates/'))return Response.json({revision,candidate:{id:'a',name:'候选人',notes:'完整备注',resumes:[]}});return Response.json({user:{id:'hr',role:'HR'},data:{partialCandidates:true,candidates:[summary],applications:[],revision:2}});};
 try{await load();const data=await loadCandidate('a');assert.equal(data.candidates[0].notes,'完整备注');assert.equal(data.candidates[0]._summary,undefined);await readUpdates({force:true});assert.equal(calls.at(-1),'/api/state?compact=1&candidateIds=a');revision=3;await assert.rejects(loadCandidate('a'),e=>e.status===409);}finally{globalThis.fetch=original;}
});

test('候选人导入独立保存，不发送旧全站数据；失败重试复用附件和候选人 ID',async()=>{
 const original=globalThis.fetch,data={revision:1,candidates:[],applications:[{id:'a',status:'old'}],templates:[{id:'t'}]},file=new File(['%PDF-1.4'],'cv.pdf');let uploads=0,saves=0;
 globalThis.fetch=async(path,options={})=>{
  if(!options.method)return Response.json({user:{id:'hr',role:'HR'},data});
  if(path.startsWith('/api/resumes?')){uploads++;return Response.json({id:'f',name:'cv.pdf',type:'application/pdf'});}
  assert.equal(path,'/api/candidates/save');const body=JSON.parse(options.body);assert.equal(body.mode,'create');assert.equal(body.candidate.id,'new');assert.equal(body.revision,undefined);assert.equal(body.applications,undefined);assert.equal(body.templates,undefined);assert.equal(body.candidate.resumes[0].id,'f');saves++;
  return saves===1?Response.json({error:'暂时不可用'},{status:503}):Response.json({...data,revision:99,candidates:[body.candidate],applications:[{id:'a',status:'server-latest'}]});
 };
 try{await load();const next={...data,candidates:[{id:'new',name:'候选人',resumes:[{file}]}]};await assert.rejects(save(next,()=>{},null,{id:'new',mode:'create'}),/暂时不可用/);const result=await save(next,()=>{},null,{id:'new',mode:'create'});assert.equal(uploads,1);assert.equal(saves,2);assert.equal(result.revision,99);assert.equal(result.applications[0].status,'server-latest');assert.equal(next.candidates[0].resumes[0].file,file);}finally{globalThis.fetch=original;}
});
test('候选人资料编辑携带原资料用于字段冲突检查，不重新上传已有附件',async()=>{
 const original=globalThis.fetch,candidate={id:'c',company:'原公司',resumes:[{id:'f'}]},data={revision:1,candidates:[candidate],applications:[]};
 globalThis.fetch=async(path,options={})=>{if(!options.method)return Response.json({user:{id:'hr',role:'HR'},data});assert.equal(path,'/api/candidates/save');const body=JSON.parse(options.body);assert.equal(body.mode,'profile');assert.equal(body.originalCandidate.company,'原公司');assert.equal(body.candidate.company,'新公司');assert.equal(body.candidate.resumes,undefined);return Response.json({...data,revision:10,candidates:[{...candidate,company:'新公司'}]});};
 try{await load();const saved=await save({...data,candidates:[{...candidate,company:'新公司'}]},()=>{},null,{id:'c',mode:'profile'});assert.equal(saved.candidates[0].company,'新公司');}finally{globalThis.fetch=original;}
});
test('HR 补充独立提交当前轮次和说明，携带已加载档案 ID，成功后更新基线',async()=>{
 const {supplementResumeReview,readUpdates}=await import('../src/repository.js'),original=globalThis.fetch,data={revision:7,partialCandidates:true,candidates:[{id:'full',notes:'完整记录'},{id:'summary',_summary:true}],applications:[]};let sent;
 globalThis.fetch=async(path,options={})=>{if(options.method==='POST'){assert.equal(path,'/api/applications/app/review-supplement');sent=JSON.parse(options.body);return Response.json({...data,revision:8});}if(path==='/api/state/version')return Response.json({revision:8,directoryVersion:'qa',userId:'hr'});return Response.json({user:{id:'hr',role:'HR'},data,directoryVersion:'qa'});};
 try{await load();await supplementResumeReview('app','round','已核实补充信息','面试官');assert.deepEqual(sent,{revision:7,roundId:'round',response:'已核实补充信息',interviewer:'面试官',candidateIds:['full']});assert.equal(await readUpdates(),null);}finally{globalThis.fetch=original;}
});

test('离开记忆中的详情页后，取消的资料读取不能更新当前数据基线',async()=>{
 const {loadCandidate,readUpdates}=await import('../src/repository.js'),original=globalThis.fetch,calls=[];
 const controller=new AbortController();let release;
 globalThis.fetch=async(path,options={})=>{
  calls.push(path);
  if(path.startsWith('/api/candidates/')){assert.equal(options.signal,controller.signal);await new Promise(resolve=>release=resolve);return Response.json({revision:4,candidate:{id:'a',notes:'已取消的结果'}});}
  return Response.json({user:{id:'hr',role:'HR'},data:{revision:4,partialCandidates:true,candidates:[{id:'a',name:'候选人',_summary:true}],applications:[]}});
 };
 try{
  await load();const pending=loadCandidate('a',{signal:controller.signal});controller.abort();release();
  await assert.rejects(pending,e=>e.name==='AbortError');await readUpdates({force:true});
  assert.equal(calls.at(-1),'/api/state?compact=1&candidateIds=');
 }finally{globalThis.fetch=original;}
});
