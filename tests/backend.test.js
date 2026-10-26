import {test} from 'node:test';
import assert from 'node:assert/strict';
import {hashPassword,verifyPassword} from '../server/auth.js';
import {validateResume} from '../server/files.js';
import {visibleState,emptyState} from '../server/database.js';
import {validateHRState} from '../server/validation.js';
import {round} from '../src/model.js';
test('密码哈希带随机盐且拒绝错误和短密码',async()=>{const p='A-valid-password-123';const first=await hashPassword(p),second=await hashPassword(p);assert.notEqual(first,second);assert.equal(await verifyPassword(p,first),true);assert.equal(await verifyPassword('wrong',first),false);await assert.rejects(hashPassword('short'));});
test('上传拒绝伪装扩展名、路径、空文件，识别 PDF',()=>{assert.equal(validateResume('cv.pdf',Buffer.from('%PDF-1.4')).type,'application/pdf');for(const [name,file] of [['cv.pdf',Buffer.from('fake')],['../cv.pdf',Buffer.from('%PDF')],['cv.docx',Buffer.alloc(0)]])assert.throws(()=>validateResume(name,file));});
const file={id:'file1',name:'cv.pdf',mime:'application/pdf',size:100};
function state(){return {candidates:[{id:'candidate1',name:'测试',phone:'123',email:'',notes:'HR 私密备注'}],templates:[],applications:[{id:'app1',candidateId:'candidate1',job:'测试岗位',status:'进行中',reason:'',resume:{id:file.id,name:file.name,type:file.mime,size:file.size},history:[],rounds:[{...round('初试'),id:'round1',interviewer:'面试官甲',time:'2026-10-20T10:00',location:'https://example.com/meeting',feedback:{status:'draft',summary:'草稿内容',conclusion:''}},{...round('复试'),id:'round2',interviewer:'面试官乙',time:'2026-10-21T10:00',feedback:{status:'submitted',summary:'其他面试官评价'}}]}]};}
test('面试官只能收到本人面试及本人面评，HR 不读取草稿正文',()=>{const s=state();const view=visibleState(s,{name:'面试官甲',role:'interviewer'},[],1);assert.equal(view.applications[0].rounds.length,1);assert.equal(view.applications[0].rounds[0].feedback.summary,'草稿内容');assert.equal(view.candidates[0].notes,undefined);assert.equal(visibleState(s,{name:'无人',role:'interviewer'},[],1).candidates.length,0);assert.equal(visibleState(s,{role:'HR'},[],1).applications[0].rounds[0].feedback.summary,undefined);});
test('HR 保存不清除隐藏草稿，禁止代录、清除原记录及结束后新增安排',()=>{const s=state(),view=visibleState(s,{role:'HR'},[],1),names=['面试官甲','面试官乙'];const saved=validateHRState(s,view,names,[file],'HR');assert.equal(saved.applications[0].rounds[0].feedback.summary,'草稿内容');const removed=structuredClone(view);removed.applications=[];assert.throws(()=>validateHRState(s,removed,names,[file],'HR'));const forged=structuredClone(view);forged.applications[0].rounds[0].feedback={status:'submitted',summary:'HR 代录'};assert.throws(()=>validateHRState(s,forged,names,[file],'HR'));});
test('初始数据库业务数据为空，未安排默认面试官不产生可见面试',()=>{assert.deepEqual(emptyState(),{candidates:[],applications:[],templates:[]});const s=state();s.applications[0].rounds[0].time='';assert.equal(visibleState(s,{name:'面试官甲',role:'interviewer'},[],0).applications.length,0);});

test('新应聘岗位取自模板，学历与联系方式强校验，并阻止重复进行中',()=>{
 const c={id:'c',name:'新候选人',phone:'13800138000',email:'hr@example.com',age:'28',highestEducation:'本科',experience:'5 年',company:'示例公司',currentTitle:'产品经理',city:'杭州',notes:'已电话沟通，候选人意向产品岗位，可两周内到岗，建议安排业务面试。',education:'普本'},t={id:'t',name:'产品经理',nodes:[{name:'初试',interviewer:''}]};
 const make=()=>({candidates:[c],templates:[t],applications:[{id:'a',candidateId:'c',templateId:'t',job:'产品经理',status:'进行中',reason:'',resume:{id:file.id},history:[],rounds:[{...round('初试'),id:'r'}]}]});
 const valid=validateHRState(emptyState(),make(),[],[file],'HR');assert.equal(valid.applications[0].job,'产品经理');assert.equal(valid.applications[0].templateId,'t');
 const wrongJob=make();wrongJob.applications[0].job='随意岗位';assert.throws(()=>validateHRState(emptyState(),wrongJob,[],[file],'HR'),/流程名称/);
 for(const update of [{education:''},{education:'本科'},{phone:'123'},{email:'a@b'}]){const bad=make();bad.candidates=[{...c,...update}];assert.throws(()=>validateHRState(emptyState(),bad,[],[file],'HR'));}
 const duplicate=structuredClone(valid);duplicate.applications.push({...structuredClone(valid.applications[0]),id:'new',rounds:[{...round('初试'),id:'new-round'}]});assert.throws(()=>validateHRState(valid,duplicate,[],[file],'HR'),/进行中/);
 const closed=structuredClone(valid);closed.applications[0].status='未录用';closed.applications[0].reason='结束';const again=structuredClone(closed);again.applications.push({...structuredClone(valid.applications[0]),id:'again',rounds:[{...round('初试'),id:'again-round'}]});assert.equal(validateHRState(closed,again,[],[file],'HR').applications.length,2);
 const renamed=structuredClone(valid);renamed.templates[0].name='高级产品经理';assert.equal(validateHRState(valid,renamed,[],[file],'HR').applications[0].job,'产品经理');
});
test('PDF 预签名链接有 300 秒期限，使用 inline 预览且不包含私钥',async()=>{const {S3Client}=await import('@aws-sdk/client-s3');const {signedResumeAccess}=await import('../server/files.js');const client=new S3Client({region:'us-east-1',endpoint:'https://storage.example.com',forcePathStyle:true,credentials:{accessKeyId:'TEST_ACCESS_KEY',secretAccessKey:'test-secret-do-not-expose'}});try{const access=await signedResumeAccess(client,'private-bucket',{name:'简历.pdf',mime:'application/pdf',object_key:'resumes/test.pdf'});const url=new URL(access.url);assert.equal(url.searchParams.get('X-Amz-Expires'),'300');assert.equal(url.searchParams.get('response-content-type'),'application/pdf');assert.ok(url.searchParams.get('response-content-disposition').startsWith('inline'));assert.equal(access.url.includes('test-secret-do-not-expose'),false);}finally{client.destroy();}});

test('独立简历确认后可安排不同面试官，确认只进行一次，HR 不可代确认',async()=>{
 const {decideScreening,canAccessResume}=await import('../server/screening.js');
 const t={id:'t-screen',name:'产品经理',nodes:[{name:'初试',interviewer:'甲'},{name:'复试',interviewer:'乙'}]};
 const input={candidates:[{id:'c-screen',name:'测试',phone:'13800000000',email:'screen@example.com',age:'28',highestEducation:'本科',experience:'5 年',company:'示例公司',currentTitle:'产品经理',city:'杭州',notes:'已电话沟通，候选人意向产品岗位，可两周内到岗，建议安排业务面试。',education:'普本'}],templates:[t],applications:[{id:'a-screen',candidateId:'c-screen',templateId:t.id,job:t.name,status:'进行中',resume:{id:file.id},rounds:[round('初试'),round('复试')],screening:{status:'pending',interviewer:'甲'},history:[]}]};
 const names=['甲','乙'],hr={name:'HR',role:'HR'},first={name:'甲',role:'interviewer'},other={name:'乙',role:'interviewer'};
 const saved=validateHRState(emptyState(),input,names,[file],hr.name),app=saved.applications[0];
 assert.equal(canAccessResume(app,first),true);assert.equal(canAccessResume(app,other),false);
 assert.equal(visibleState(saved,first,[],1).applications[0].rounds.length,0);assert.equal(visibleState(saved,other,[],1).applications.length,0);
 assert.throws(()=>decideScreening(app,hr,'accepted'));assert.throws(()=>decideScreening(app,other,'accepted'));assert.throws(()=>decideScreening(app,first,'declined',''));
 const before=structuredClone(saved);Object.assign(before.applications[0].rounds[0],{interviewer:'甲',time:'2026-10-20T10:00',location:'https://example.com'});
 assert.throws(()=>validateHRState(saved,before,names,[file],'HR'),/简历确认/);
 const premature=structuredClone(saved);Object.assign(premature.applications[0].rounds[1],{interviewer:'乙',time:'2026-10-21T10:00',location:'https://example.com'});assert.throws(()=>validateHRState(saved,premature,names,[file],'HR'),/简历确认/);
 const forged=structuredClone(saved);forged.applications[0].screening.status='accepted';assert.throws(()=>validateHRState(saved,forged,names,[file],'HR'),/不能代为接受/);
 const declined=decideScreening(app,first,'declined','需补充经历');assert.equal(declined.reason,'需补充经历');assert.equal(canAccessResume({...app,screening:declined},first),false);assert.equal(app.status,'进行中');
 app.screening=decideScreening(app,first,'accepted');assert.throws(()=>decideScreening(app,first,'accepted'));
 const schedule=structuredClone(saved);Object.assign(schedule.applications[0].rounds[0],{interviewer:'甲',time:'2026-10-20T10:00',location:'https://example.com'});
 Object.assign(schedule.applications[0].rounds[1],{interviewer:'乙',time:'2026-10-21T10:00',location:'https://example.com'});
 const arranged=validateHRState(saved,schedule,names,[file],'HR');assert.equal(arranged.applications[0].rounds[1].interviewer,'乙');
 const wrong=structuredClone(schedule);wrong.applications[0].rounds[0].interviewer='乙';assert.equal(validateHRState(saved,wrong,names,[file],'HR').applications[0].rounds[0].interviewer,'乙');
 const resend=structuredClone(saved);resend.applications[0].screening={status:'pending',interviewer:'乙'};const resent=validateHRState(saved,resend,names,[file],'HR');assert.equal(canAccessResume(resent.applications[0],first),false);assert.equal(canAccessResume(resent.applications[0],other),true);
 const ended={...app,status:'候选人退出'};assert.throws(()=>decideScreening(ended,first,'accepted'));assert.equal(canAccessResume(ended,first),false);
});

test('终止的原应聘不能重新推送/排期；重新捞起创建新 ID 并保留历史',async()=>{
 const {terminateFailedApplication}=await import('../src/model.js');
 const original=state();original.applications[0].screening={status:'declined',reason:'不匹配'};
 terminateFailedApplication(original.applications[0]);const view=visibleState(original,{role:'HR'},[],1);
 const reopen=structuredClone(view);reopen.applications[0].status='进行中';assert.throws(()=>validateHRState(original,reopen,['面试官甲','面试官乙'],[file],'HR'));
 const resend=structuredClone(view);resend.applications[0].screening={status:'pending',interviewer:'面试官甲'};assert.throws(()=>validateHRState(original,resend,['面试官甲','面试官乙'],[file],'HR'),/结束/);
});

test('更新候选人简历保留应聘快照和历史版本；面试官看不到档案中的其他简历',()=>{
 const previous=state(),next=structuredClone(previous),newFile={id:'file2',name:'new.pdf',mime:'application/pdf',size:200};
 next.candidates[0].resumes=[{id:newFile.id,name:'forged.pdf'}];
 const saved=validateHRState(previous,next,['面试官甲','面试官乙'],[file,newFile],'HR');
 assert.equal(saved.candidates[0].resumes[0].name,'new.pdf');assert.ok(saved.candidates[0].resumes[0].uploadedAt);assert.deepEqual(saved.applications[0].resume,previous.applications[0].resume);
 const visible=visibleState(saved,{name:'面试官甲',role:'interviewer'},[],1);assert.equal(visible.candidates[0].resumes,undefined);assert.equal(visible.applications[0].resume.id,file.id);
 const missing=structuredClone(saved);missing.candidates[0].resumes=[];assert.throws(()=>validateHRState(saved,missing,['面试官甲','面试官乙'],[file,newFile],'HR'),/不能删除/);
 const unknown=structuredClone(previous);unknown.candidates[0].resumes=[{id:'unknown'}];assert.throws(()=>validateHRState(previous,unknown,['面试官甲','面试官乙'],[file],'HR'),/附件不存在/);
});

test('流程 JD 可选且有长度校验；应聘取服务端模板快照，模板修改或伪造请求不改写历史',()=>{
 const c={id:'c',name:'候选人',phone:'13800138000',email:'candidate@example.com',age:'28',highestEducation:'本科',experience:'5 年',company:'示例公司',currentTitle:'产品经理',city:'杭州',notes:'已电话沟通，候选人意向产品岗位，可两周内到岗，建议安排业务面试。',education:'普本'},template={id:'t',name:'产品经理',jd:'负责产品规划\n要求业务分析能力',nodes:[{name:'初试',interviewer:''}]};
 const input={candidates:[c],templates:[template],applications:[{id:'a',candidateId:'c',templateId:'t',job:template.name,jd:'客户端伪造',status:'进行中',reason:'',resume:{id:file.id},rounds:[{...round('初试'),id:'r'}]}]};
 const saved=validateHRState(emptyState(),input,[],[file],'HR');assert.equal(saved.applications[0].jd,template.jd);
 const changed=structuredClone(saved);changed.templates[0].jd='新的岗位职责';changed.applications[0].jd='伪造改写';const updated=validateHRState(saved,changed,[],[file],'HR');assert.equal(updated.applications[0].jd,template.jd);assert.equal(updated.templates[0].jd,'新的岗位职责');
 const optional=structuredClone(input);delete optional.templates[0].jd;assert.equal(validateHRState(emptyState(),optional,[],[file],'HR').applications[0].jd,'');
 const oversized=structuredClone(input);oversized.templates[0].jd='a'.repeat(20001);assert.throws(()=>validateHRState(emptyState(),oversized,[],[file],'HR'),/JD/);
});

test('冻结面试官的历史安排保留，但不能新增或修改其安排',()=>{
 const previous=state(),view=visibleState(previous,{role:'HR'},[],1),names=['面试官甲','面试官乙'];
 assert.equal(validateHRState(previous,view,names,[file],'HR',['面试官乙']).applications[0].rounds[0].interviewer,'面试官甲');
 const changed=structuredClone(view);changed.applications[0].rounds[0].time='2026-10-22T10:00';assert.throws(()=>validateHRState(previous,changed,names,[file],'HR',['面试官乙']),/已冻结/);
});
test('模板独立保存简历确认人，不覆盖一面默认面试官，并校验冻结确认人',()=>{
 const t={id:'independent-review',name:'流程',reviewer:'甲',nodes:[{name:'一面',interviewer:'乙'}]},input={...emptyState(),templates:[t]};
 const saved=validateHRState(emptyState(),input,['甲','乙'],[],'HR');assert.equal(saved.templates[0].reviewer,'甲');assert.equal(saved.templates[0].nodes[0].interviewer,'乙');
 assert.throws(()=>validateHRState(emptyState(),input,['甲','乙'],[],'HR',['乙']),/确认人/);
 assert.equal(validateHRState(saved,saved,['甲','乙'],[],'HR',['乙']).templates[0].reviewer,'甲');
});
test('独立确认人只获得是否已排期的摘要，不泄露其他面试官轮次或面评',()=>{
 const original=state();original.applications[0].screening={interviewer:'确认人',status:'accepted'};
 const view=visibleState(original,{role:'interviewer',name:'确认人'},[],1);assert.equal(view.applications[0].rounds.length,0);assert.equal(view.applications[0].screening.interviewsScheduled,true);assert.equal(original.applications[0].screening.interviewsScheduled,undefined);
});

test('应聘所有权：其他 HR 可读不可改，保存自己记录时保留他人隐藏草稿，管理员可操作',()=>{
 const previous=state(),owner={id:'owner',name:'HR甲',role:'HR'},other={id:'other',name:'HR乙',role:'HR'},admin={id:'admin',name:'管理员',role:'admin'},names=['面试官甲','面试官乙'];previous.applications[0].createdBy=owner.id;
 const view=visibleState(previous,other,[],1);assert.equal(view.applications.length,1);
 const save=(input,user)=>validateHRState(previous,input,names,[file],user.name,names,user);
 assert.equal(save(view,other).applications[0].rounds[0].feedback.summary,'草稿内容');
 for(const mutate of [a=>{a.rounds[0].location='https://example.com/new';},a=>{a.status='未录用';a.reason='结束';},a=>{a.screening={status:'pending',interviewer:'面试官甲'};},a=>{a.createdBy=other.id;},a=>{a.rounds.push({...round('加面'),id:'added'});}]){const input=structuredClone(view);mutate(input.applications[0]);assert.throws(()=>save(input,other),e=>e.status===403);}
 const update=structuredClone(view);update.applications[0].rounds[0].location='https://example.com/new';
 assert.equal(save(update,owner).applications[0].createdBy,owner.id);assert.equal(save(update,admin).applications[0].rounds[0].location,'https://example.com/new');
});
test('历史应聘按最早创建日志识别所有者；新应聘创建者只取认证账号，不能伪造',async()=>{
 const {canManageApplication}=await import('../src/permissions.js');const hr={id:'hr-id',name:'HR甲',role:'HR'};
 const legacy={history:[{actor:'HR乙',action:'安排变更'},{actor:'HR甲',action:'创建应聘'}]};assert.equal(canManageApplication(hr,legacy),true);assert.equal(canManageApplication({...hr,name:'HR乙'},legacy),false);assert.equal(canManageApplication(hr,{history:[]}),false);assert.equal(canManageApplication({role:'admin'},{history:[]}),true);
 const previous=state();previous.applications=[];previous.candidates[0]={id:'candidate1',name:'测试',phone:'13800138000',email:'',age:'28',highestEducation:'本科',experience:'5 年',company:'示例公司',currentTitle:'产品经理',city:'杭州',notes:'已电话沟通，候选人意向产品岗位，可两周内到岗，建议安排业务面试。',education:'普本',resumes:[]};previous.templates=[{id:'t',name:'岗位',nodes:[{name:'初试',interviewer:''}]}];
 const input=structuredClone(previous);input.applications=[{id:'new',createdBy:'forged',candidateId:'candidate1',templateId:'t',job:'岗位',status:'进行中',resume:{id:file.id},screening:{status:'skipped',interviewer:''},rounds:[round('初试')]}];
 const saved=validateHRState(previous,input,[],[file],hr.name,[],hr);assert.equal(saved.applications[0].createdBy,hr.id);
});

test('排期操作由服务器追加真实操作人和时间，不接受伪造日志，管理员代排不改应聘归属',()=>{
 const previous=state(),actor={id:'admin-id',name:'管理员',role:'admin'},names=['面试官甲','面试官乙'];previous.applications[0].createdBy='hr-owner';previous.applications[0].screening={status:'skipped',interviewer:'',reason:''};
 Object.assign(previous.applications[0].rounds[0],{time:'',location:'',focus:'',feedback:{status:'none'}});
 const input=visibleState(previous,actor,[],1);Object.assign(input.applications[0].rounds[0],{time:'2026-10-21T10:00',location:'https://example.com/meeting',scheduleEvents:[{type:'created',at:'2099-01-01',actorId:'forged'}]});
 const created=validateHRState(previous,input,names,[file],actor.name,names,actor),r=created.applications[0].rounds[0];assert.equal(created.applications[0].createdBy,'hr-owner');assert.equal(r.scheduleEvents.length,1);assert.equal(r.scheduleEvents[0].type,'created');assert.equal(r.scheduleEvents[0].actorId,actor.id);assert.notEqual(r.scheduleEvents[0].at,'2099-01-01');
 const edit=visibleState(created,actor,[],2);edit.applications[0].rounds[0].time='2026-10-22T10:00';edit.applications[0].rounds[0].scheduleEvents=[];const changed=validateHRState(created,edit,names,[file],actor.name,names,actor);assert.deepEqual(changed.applications[0].rounds[0].scheduleEvents.map(e=>e.type),['created','rescheduled']);
 const focus=visibleState(changed,actor,[],3);focus.applications[0].rounds[0].focus='补充重点';const focused=validateHRState(changed,focus,names,[file],actor.name,names,actor);assert.equal(focused.applications[0].rounds[0].scheduleEvents.length,2);
 const cancel=visibleState(focused,actor,[],4);cancel.applications[0].rounds[0].cancelled=true;const cancelled=validateHRState(focused,cancel,names,[file],actor.name,names,actor);assert.equal(cancelled.applications[0].rounds[0].scheduleEvents.at(-1).type,'cancelled');
 const own=visibleState(created,{name:'面试官甲',role:'interviewer'},[],1);assert.equal(own.applications[0].rounds[0].scheduleEvents,undefined);
});

test('我发起的按创建人匹配，管理员不因可管理全部而匹配他人记录',async()=>{
 const {isApplicationCreator}=await import('../src/permissions.js'),hr={id:'h',name:'HR甲',role:'HR'},admin={id:'a',name:'管理员',role:'admin'};
 assert.equal(isApplicationCreator(hr,{createdBy:'h'}),true);assert.equal(isApplicationCreator(hr,{createdBy:'other',history:[{action:'创建应聘',actor:'HR甲'}]}),false);
 assert.equal(isApplicationCreator(admin,{createdBy:'h'}),false);assert.equal(isApplicationCreator(admin,{createdBy:'a'}),true);assert.equal(isApplicationCreator(hr,{history:[{action:'修改应聘',actor:'HR甲'},{action:'创建应聘记录',actor:'HR乙'}]}),false);assert.equal(isApplicationCreator(hr,{history:[{action:'修改应聘',actor:'HR乙'},{action:'创建应聘记录',actor:'HR甲'}]}),true);assert.equal(isApplicationCreator(hr,{history:[]}),false);
});

test('账号改为 HR 后保留原面试人与流程历史，不能再将其用于新增或修改排期',()=>{
 const previous=state();previous.templates=[{id:'old-template',name:'历史岗位',reviewer:'面试官甲',nodes:[{name:'初试',interviewer:'面试官甲'}]}];const names=['面试官乙'],view=visibleState(previous,{role:'admin'},[],1);
 const saved=validateHRState(previous,view,names,[file],'管理员',names);assert.equal(saved.templates[0].reviewer,'面试官甲');assert.equal(saved.templates[0].nodes[0].interviewer,'面试官甲');assert.equal(saved.applications[0].rounds[0].interviewer,'面试官甲');assert.equal(saved.applications[0].rounds[0].feedback.summary,'草稿内容');
 const changed=structuredClone(view);changed.applications[0].rounds[0].time='2026-10-22T10:00';assert.throws(()=>validateHRState(previous,changed,names,[file],'管理员',names),/不再是面试官/);
 const template=structuredClone(view);template.templates.push({...template.templates[0],id:'new-template'});assert.throws(()=>validateHRState(previous,template,names,[file],'管理员',names),/有效的默认面试官/);
});

test('应聘按原始创建时间倒序，修改时间不影响，缺失时间置后，同时间保持稳定且不改原数组',async()=>{
 const {newestApplications}=await import('../src/model.js');const old={id:'old',history:[{action:'修改应聘',at:'2026-10-21T00:00:00Z'},{action:'创建应聘记录',at:'2026-10-01T00:00:00Z'}]},recent={id:'recent',history:[{action:'创建应聘',at:'2026-10-19T00:00:00Z'}]},same={id:'same',history:[{action:'创建应聘',at:'2026-10-19T00:00:00Z'}]},unknown={id:'unknown',history:[{action:'修改',at:'2026-10-22T00:00:00Z'},{action:'创建应聘',at:'invalid'}]};const input=[old,unknown,recent,same],copy=structuredClone(input);assert.deepEqual(newestApplications(input).map(a=>a.id),['recent','same','old','unknown']);assert.deepEqual(input,copy);
 const duplicate={id:'dup',history:[{action:'创建应聘',at:'2026-10-23T00:00:00Z'},{action:'创建应聘',at:'2026-09-01T00:00:00Z'}]};assert.deepEqual(newestApplications([duplicate,old]).map(a=>a.id),['old','dup']);
});

test('only current pending resume reviewer sees HR communication notes in browser; MCP and other interviewers remain isolated',async()=>{
 const {myInterviews}=await import('../server/mcp.js');
 const s=state(),reviewer={id:'reviewer',role:'interviewer',name:'面试官甲'};
 s.applications[0].screening={status:'pending',interviewer:reviewer.name};
 assert.equal(visibleState(s,reviewer,[],1).candidates[0].notes,s.candidates[0].notes);
 assert.equal(visibleState(s,{name:'面试官乙',role:'interviewer'},[],1).candidates[0].notes,undefined);
 assert.equal(myInterviews(s,reviewer).candidates[0].notes,undefined);
 for(const status of ['accepted','declined','skipped']){s.applications[0].screening.status=status;assert.equal(visibleState(s,reviewer,[],1).candidates[0].notes,undefined);}
 s.applications[0].screening.status='pending';s.applications[0].status='未录用';assert.equal(visibleState(s,reviewer,[],1).candidates[0].notes,undefined);
});

test('HR 可删除未安排轮次，保留历史、顺序及至少一轮的限制',()=>{
 const before=state();before.applications[0].rounds.push({...round('加面'),id:'extra'});
 const remove=(s,id)=>{const next=visibleState(s,{role:'HR'},[],1);next.applications[0].rounds=next.applications[0].rounds.filter(r=>r.id!==id);return next;};
 const validate=(s,next,actor=null)=>validateHRState(s,next,['面试官甲','面试官乙'],[file],'HR',undefined,actor);
 const saved=validate(before,remove(before,'extra'));assert.equal(saved.applications[0].rounds.length,2);assert.match(saved.applications[0].history[0].action,/删除面试轮次：加面/);assert.equal(saved.applications[0].rounds[0].feedback.summary,'草稿内容');
 for(const change of [{time:'2026-10-30T14:00'},{feedback:{status:'draft'}},{feedbackVersions:[{status:'submitted'}]},{scheduleEvents:[{type:'cancelled'}]}]){const s=structuredClone(before);Object.assign(s.applications[0].rounds[2],change);assert.throws(()=>validate(s,remove(s,'extra')),/仅可删除/);}
 const ended=structuredClone(before);ended.applications[0].status='未录用';assert.throws(()=>validate(ended,remove(ended,'extra')),/仅可删除/);
 const sole=structuredClone(before);sole.applications[0].rounds=[sole.applications[0].rounds[2]];assert.throws(()=>validate(sole,remove(sole,'extra')),/至少保留/);
 const reordered=remove(before,'extra');reordered.applications[0].rounds.reverse();assert.throws(()=>validate(before,reordered),/顺序/);
 before.applications[0].createdBy='owner';assert.throws(()=>validate(before,remove(before,'extra'),{id:'other',name:'HR',role:'HR'}),/仅创建/);
});

test('面试官可见推荐 HR，优先实际推送人，旧记录回退发起人且不泄露其他账号',()=>{
 const s=state(),person={id:'i',name:'面试官甲',role:'interviewer'};
 s.applications[0].createdBy='hr';s.applications[0].screening={status:'accepted',interviewer:'面试官乙',sentBy:'实际推送人'};
 const users=[{id:'hr',name:'发起 HR',role:'HR'}];
 let view=visibleState(s,person,users,1);assert.equal(view.applications[0].recommendedBy,'实际推送人');assert.equal(view.applications[0].screening,undefined);assert.deepEqual(view.users,[person]);assert.deepEqual(view.applications[0].history,[]);
 delete s.applications[0].screening;assert.equal(visibleState(s,person,users,1).applications[0].recommendedBy,'发起 HR');
 delete s.applications[0].createdBy;s.applications[0].history=[{actor:'后续操作人',action:'修改安排'},{actor:'历史发起人',action:'创建应聘'}];assert.equal(visibleState(s,person,[],1).applications[0].recommendedBy,'历史发起人');
 s.applications[0].history=[];assert.equal(visibleState(s,person,[],1).applications[0].recommendedBy,'未记录');
 assert.equal(visibleState(s,person,[],1,{screeningNotes:false}).applications[0].recommendedBy,undefined);
});
