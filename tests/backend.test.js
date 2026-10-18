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
 const c={id:'c',name:'新候选人',phone:'13800138000',email:'hr@example.com',education:'普本'},t={id:'t',name:'产品经理',nodes:[{name:'初试',interviewer:''}]};
 const make=()=>({candidates:[c],templates:[t],applications:[{id:'a',candidateId:'c',templateId:'t',job:'产品经理',status:'进行中',reason:'',resume:{id:file.id},history:[],rounds:[{...round('初试'),id:'r'}]}]});
 const valid=validateHRState(emptyState(),make(),[],[file],'HR');assert.equal(valid.applications[0].job,'产品经理');assert.equal(valid.applications[0].templateId,'t');
 const wrongJob=make();wrongJob.applications[0].job='随意岗位';assert.throws(()=>validateHRState(emptyState(),wrongJob,[],[file],'HR'),/流程名称/);
 for(const update of [{education:''},{education:'本科'},{phone:'123'},{email:'a@b'}]){const bad=make();bad.candidates=[{...c,...update}];assert.throws(()=>validateHRState(emptyState(),bad,[],[file],'HR'));}
 const duplicate=structuredClone(valid);duplicate.applications.push({...structuredClone(valid.applications[0]),id:'new',rounds:[{...round('初试'),id:'new-round'}]});assert.throws(()=>validateHRState(valid,duplicate,[],[file],'HR'),/进行中/);
 const closed=structuredClone(valid);closed.applications[0].status='未录用';closed.applications[0].reason='结束';const again=structuredClone(closed);again.applications.push({...structuredClone(valid.applications[0]),id:'again',rounds:[{...round('初试'),id:'again-round'}]});assert.equal(validateHRState(closed,again,[],[file],'HR').applications.length,2);
 const renamed=structuredClone(valid);renamed.templates[0].name='高级产品经理';assert.equal(validateHRState(valid,renamed,[],[file],'HR').applications[0].job,'产品经理');
});
test('PDF 预签名链接有 300 秒期限，使用 inline 预览且不包含私钥',async()=>{const {S3Client}=await import('@aws-sdk/client-s3');const {signedResumeAccess}=await import('../server/files.js');const client=new S3Client({region:'us-east-1',endpoint:'https://storage.example.com',forcePathStyle:true,credentials:{accessKeyId:'TEST_ACCESS_KEY',secretAccessKey:'test-secret-do-not-expose'}});try{const access=await signedResumeAccess(client,'private-bucket',{name:'简历.pdf',mime:'application/pdf',object_key:'resumes/test.pdf'});const url=new URL(access.url);assert.equal(url.searchParams.get('X-Amz-Expires'),'300');assert.equal(url.searchParams.get('response-content-type'),'application/pdf');assert.ok(url.searchParams.get('response-content-disposition').startsWith('inline'));assert.equal(access.url.includes('test-secret-do-not-expose'),false);}finally{client.destroy();}});

test('首轮简历先推送后接受；HR 不可代接受，未接受不可安排，后续轮次不重复筛选',async()=>{
 const {decideScreening,canAccessResume}=await import('../server/screening.js');
 const t={id:'t-screen',name:'产品经理',nodes:[{name:'初试',interviewer:'甲'},{name:'复试',interviewer:'乙'}]};
 const input={candidates:[{id:'c-screen',name:'测试',phone:'13800000000',email:'',education:'普本'}],templates:[t],applications:[{id:'a-screen',candidateId:'c-screen',templateId:t.id,job:t.name,status:'进行中',resume:{id:file.id},rounds:[round('初试'),round('复试')],screening:{status:'pending',interviewer:'甲'},history:[]}]};
 const names=['甲','乙'],hr={name:'HR',role:'HR'},first={name:'甲',role:'interviewer'},other={name:'乙',role:'interviewer'};
 const saved=validateHRState(emptyState(),input,names,[file],hr.name),app=saved.applications[0];
 assert.equal(canAccessResume(app,first),true);assert.equal(canAccessResume(app,other),false);
 assert.equal(visibleState(saved,first,[],1).applications[0].rounds.length,0);assert.equal(visibleState(saved,other,[],1).applications.length,0);
 assert.throws(()=>decideScreening(app,hr,'accepted'));assert.throws(()=>decideScreening(app,other,'accepted'));assert.throws(()=>decideScreening(app,first,'declined',''));
 const before=structuredClone(saved);Object.assign(before.applications[0].rounds[0],{interviewer:'甲',time:'2026-10-20T10:00',location:'https://example.com'});
 assert.throws(()=>validateHRState(saved,before,names,[file],'HR'),/接受/);
 const forged=structuredClone(saved);forged.applications[0].screening.status='accepted';assert.throws(()=>validateHRState(saved,forged,names,[file],'HR'),/不能代为接受/);
 const declined=decideScreening(app,first,'declined','需补充经历');assert.equal(declined.reason,'需补充经历');assert.equal(canAccessResume({...app,screening:declined},first),false);assert.equal(app.status,'进行中');
 app.screening=decideScreening(app,first,'accepted');assert.throws(()=>decideScreening(app,first,'accepted'));
 const schedule=structuredClone(saved);Object.assign(schedule.applications[0].rounds[0],{interviewer:'甲',time:'2026-10-20T10:00',location:'https://example.com'});
 Object.assign(schedule.applications[0].rounds[1],{interviewer:'乙',time:'2026-10-21T10:00',location:'https://example.com'});
 const arranged=validateHRState(saved,schedule,names,[file],'HR');assert.equal(arranged.applications[0].rounds[1].interviewer,'乙');
 const wrong=structuredClone(schedule);wrong.applications[0].rounds[0].interviewer='乙';assert.throws(()=>validateHRState(saved,wrong,names,[file],'HR'),/已接受/);
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
 const c={id:'c',name:'候选人',phone:'13800138000',education:'普本'},template={id:'t',name:'产品经理',jd:'负责产品规划\n要求业务分析能力',nodes:[{name:'初试',interviewer:''}]};
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
