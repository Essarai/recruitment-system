import {seed} from './fixtures.js';
import {test} from 'node:test';import assert from 'node:assert/strict';
import {pending,validateSchedule,submitFeedback,endApplication} from '../src/model.js';
test('下一轮安排不清除上一轮面评，模板修改不影响已有轮次',()=>{const s=seed(),a=s.applications[0];assert.equal(pending(a),2);validateSchedule(a,a.rounds[1],{interviewer:'周宁',time:'2026-10-20T14:00',mode:'线上',location:'https://example.com'});assert.equal(a.rounds[0].feedback.status,'none');s.templates[0].nodes[0]='筛选';assert.equal(a.rounds[0].name,'初试');});
test('提交要求本人、完成确认和必填字段；不自动推进',()=>{const a=seed().applications[0],r=a.rounds[0],f={summary:'依据充分',conclusion:'建议通过'};assert.throws(()=>submitFeedback(a,r,'周宁',f,true));assert.throws(()=>submitFeedback(a,r,'陈晨',f,false));assert.equal(submitFeedback(a,r,'陈晨',f,true).status,'submitted');assert.equal(a.status,'进行中');r.cancelled=true;assert.throws(()=>submitFeedback(a,r,'陈晨',f,true));});
test('结束允许欠评，禁止新增安排，允许原面试官补交',()=>{const a=seed().applications[0];assert.throws(()=>endApplication(a,'公司决定录用',''));const ended=endApplication(a,'公司决定录用','确认录用');assert.equal(pending(ended),2);assert.throws(()=>validateSchedule(ended,ended.rounds[2],{}));assert.equal(submitFeedback(ended,ended.rounds[0],'陈晨',{summary:'补交',conclusion:'建议通过'},true).status,'submitted');});

test('会议链接允许 HR 手动输入常见会议 URL，拒绝非网页协议和无效地址',()=>{const a=seed().applications[0],r=a.rounds[1];for(const location of ['https://meeting.tencent.com/dm/demo','https://meet.feishu.cn/demo?code=123'])validateSchedule(a,r,{interviewer:r.interviewer,time:r.time,mode:'线上',location});for(const location of ['javascript:alert(1)','https://','https://user:secret@example.com'])assert.throws(()=>validateSchedule(a,r,{interviewer:r.interviewer,time:r.time,mode:'线上',location}));});
test('候选人扩展资料兼容旧记录，清理空白且不混入应聘字段',async()=>{const {candidateDetails}=await import('../src/model.js');assert.equal(candidateDetails({}).company,'');assert.deepEqual(candidateDetails({company:' 示例公司 ',experience:'5 年',notes:' 待沟通 ',job:'PM'}),{age:'',highestEducation:'',experience:'5 年',company:'示例公司',currentTitle:'',education:'',city:'',notes:'待沟通'});});

test('年龄选填并拒绝负数、小数与异常值',async()=>{const {candidateDetails}=await import('../src/model.js');assert.equal(candidateDetails({age:'28',education:'本科'}).age,'28');for(const age of ['-1','28.5','121','未知'])assert.throws(()=>candidateDetails({age}));assert.equal(candidateDetails({age:''}).age,'');});


test('节点可指定默认面试官，旧模板兼容，实例与模板相互独立',async()=>{
 const {roundsFromTemplate,templateNodes}=await import('../src/model.js');
 const template={nodes:[{name:' 初试 ',interviewer:'陈晨'},{name:'复试',interviewer:'周宁'}]};
 const first=roundsFromTemplate(template),second=roundsFromTemplate(template);
 assert.equal(first[0].name,'初试');assert.equal(first[1].interviewer,'周宁');assert.equal(first[0].time,'');assert.equal(pending({rounds:first}),0);
 template.nodes[0].interviewer='李强';assert.equal(first[0].interviewer,'陈晨');first[0].interviewer='李强';assert.equal(second[0].interviewer,'陈晨');assert.notEqual(first[0].id,second[0].id);
 assert.deepEqual(templateNodes(['初试','终试']),[{name:'初试',interviewer:''},{name:'终试',interviewer:''}]);
 for(const nodes of [[],[{name:'',interviewer:''}],[{name:'初试',interviewer:'未知'}],['初试',' 初试 ']])assert.throws(()=>templateNodes(nodes,['陈晨','周宁','李强']));
});

test('手机号和邮箱校验：至少一项、大陆手机格式、常见邮箱格式',async()=>{
 const {validateContacts}=await import('../src/model.js');
 assert.deepEqual(validateContacts({phone:' 13800138000 ',email:''}),{phone:'13800138000',email:''});
 for(const email of ['a@example.com','user+hr@example.co.uk',"o'brien@example.com"])assert.equal(validateContacts({email}).email,email);
 for(const v of [{},{phone:'123'},{phone:'23800138000'},{email:'a@b'},{email:'a..b@example.com'},{email:'a@-example.com'},{email:'a,b@example.com'},{email:'a@ex ample.com'},{phone:'wrong',email:'a@example.com'}])assert.throws(()=>validateContacts(v));
});
test('学历只接受九种指定分类，未填写和旧分类不得用于新保存',async()=>{const {candidateDetails,educationOptions}=await import('../src/model.js');assert.deepEqual(educationOptions,['双九硕','单九硕','双二硕','单二硕','双非硕','九本','211本','普本','大专']);for(const education of educationOptions)assert.equal(candidateDetails({education},true).education,education);for(const education of ['',undefined,'本科','硕士'])assert.throws(()=>candidateDetails({education},true));});
test('候选人有进行中应聘时不可创建新应聘，结束后允许再次应聘',async()=>{const {canCreateApplication}=await import('../src/model.js');assert.equal(canCreateApplication([{candidateId:'c',status:'进行中'}],'c'),false);assert.equal(canCreateApplication([{candidateId:'c',status:'未录用'}],'c'),true);assert.equal(canCreateApplication([{candidateId:'other',status:'进行中'}],'c'),true);});

test('简历库阶段按轮次和面评计算，不把已结束流程或欠交面评显示为下一轮',async()=>{
 const {applicationStage,round}=await import('../src/model.js');
 const app={status:'进行中',rounds:[round('初试'),round('复试'),round('终面')]};
 const now=Date.parse('2026-10-17T12:00:00Z');
 assert.equal(applicationStage(app,now).name,'待推送简历');
 app.rounds[0].time='2026-10-18T12:00:00Z';assert.match(applicationStage(app,now).detail,/待面试/);
 app.rounds[0].time='2026-10-16T12:00:00Z';app.rounds[1].time='2026-10-19T12:00:00Z';assert.equal(applicationStage(app,now).name,'初试');assert.match(applicationStage(app,now).detail,/待提交面评/);
 app.rounds[0].feedback.status='returned';assert.match(applicationStage(app,now).detail,/待提交/);
 app.rounds[0].cancelled=true;assert.match(applicationStage(app,now).detail,/待重新安排/);
 app.rounds[0].feedback.status='submitted';assert.equal(applicationStage(app,now).name,'复试');assert.match(applicationStage(app,now).detail,/第 2 \/ 3 轮/);
 for(const r of app.rounds)r.feedback.status='submitted';assert.equal(applicationStage(app,now).name,'待 HR 决策');
 app.status='未录用';assert.equal(applicationStage(app,now).name,'流程终止');assert.equal(applicationStage(undefined).name,'未创建应聘');
});

test('进度颜色按实际待办区分，提交面评和录用不混为正在面试',async()=>{
 const {applicationStage,roundTone,round}=await import('../src/model.js');const now=Date.parse('2026-10-18T10:00:00Z');
 const app={status:'进行中',screening:{status:'pending'},rounds:[round('初试')]};
 assert.equal(applicationStage(app,now).tone,'pending');
 app.screening.status='declined';assert.equal(applicationStage(app,now).tone,'danger');
 app.screening.status='accepted';assert.equal(applicationStage(app,now).tone,'pending');
 const r=app.rounds[0];r.time='2026-10-19T10:00:00Z';assert.equal(applicationStage(app,now).tone,'interview');
 r.time='2026-10-17T10:00:00Z';assert.equal(applicationStage(app,now).tone,'feedback');
 r.feedback.status='returned';assert.equal(roundTone(r,now),'feedback');
 r.cancelled=true;assert.equal(roundTone(r,now),'neutral');r.cancelled=false;
 r.feedback.status='submitted';assert.equal(roundTone(r,now),'success');assert.equal(applicationStage(app,now).tone,'pending');
 app.status='公司决定录用';assert.equal(applicationStage(app,now).tone,'success');
 app.status='未录用';assert.equal(applicationStage(app,now).tone,'danger');
 app.status='候选人退出';assert.equal(applicationStage(app,now).tone,'neutral');
});

test('分段进度按实际面评完成，不因时间已过、安排后续轮次或结束而补满',async()=>{
 const {applicationProgress,round}=await import('../src/model.js');const now=Date.parse('2026-10-18T10:00:00Z');
 const app={status:'进行中',screening:{status:'pending'},rounds:[round('一面'),round('二面')]};
 let steps=applicationProgress(app,now);assert.deepEqual(steps.map(s=>s.name),['简历确认','一面','二面','结果']);assert.equal(steps[0].active,true);assert.equal(steps.filter(s=>s.done).length,0);
 app.screening.status='accepted';assert.equal(applicationProgress(app,now)[0].done,true);
 app.rounds[0].time='2026-10-17T10:00:00Z';app.rounds[1].time='2026-10-20T10:00:00Z';steps=applicationProgress(app,now);assert.equal(steps[1].done,false);assert.equal(steps[1].tone,'feedback');assert.equal(steps[2].active,true);
 app.rounds[1].feedback.status='submitted';steps=applicationProgress(app,now);assert.equal(steps[1].done,false);assert.equal(steps[2].done,true);
 app.status='未录用';steps=applicationProgress(app,now);assert.equal(steps[1].done,false);assert.equal(steps.at(-1).done,true);assert.equal(steps.at(-1).tone,'danger');assert.ok(steps.every(s=>!s.active));
});

test('简历不通过立即终止，允许从简历库捞起新应聘，但不能重开原流程',async()=>{
 const {terminateFailedApplication,canCreateApplication,applicationStatus}=await import('../src/model.js');
 const app=seed().applications[0];app.screening={status:'declined',reason:'经历不匹配',reviewedAt:'2026-10-18T10:00:00Z'};
 assert.equal(terminateFailedApplication(app,'面试官','2026-10-18T10:00:00Z'),true);
 assert.equal(app.status,'未录用');assert.equal(applicationStatus(app),'流程终止');assert.match(app.reason,/简历筛选不通过/);
 assert.equal(canCreateApplication([app],app.candidateId),true);assert.equal(app.rounds[1].cancelled,true);
 assert.throws(()=>endApplication(app,'公司决定录用','重开'));assert.equal(terminateFailedApplication(app),false);
});
test('草稿/待反馈不终止，任意轮正式不通过终止；保留其他已提交面评和过去欠评',async()=>{
 const {terminateFailedApplication,applicationFailure,roundTone}=await import('../src/model.js');
 const app=seed().applications[0],now='2026-10-18T10:00:00Z';
 app.rounds[1].feedback={status:'draft',conclusion:'建议不通过',summary:'仅草稿'};assert.equal(terminateFailedApplication(app),false);
 app.rounds[0].feedback.status='submitted';app.rounds[0].feedback.conclusion='建议通过';
 app.rounds[1].feedback.status='submitted';app.rounds[1].feedback.submittedAt=now;
 assert.equal(terminateFailedApplication(app,'面试官',now),true);assert.match(app.reason,/复试不通过/);assert.equal(roundTone(app.rounds[1]),'danger');
 assert.equal(app.rounds[0].feedback.conclusion,'建议通过');assert.equal(app.rounds[2].cancelled,true);
 app.rounds[1].feedback.status='returned';assert.equal(terminateFailedApplication(app),false);assert.equal(app.status,'未录用');
 const overdue=seed().applications[0];overdue.rounds[1].feedback={status:'submitted',conclusion:'建议不通过',summary:'不匹配'};terminateFailedApplication(overdue,'面试官',now);assert.equal(overdue.rounds[0].cancelled,false);
});

test('重新捞起的可选简历合并候选人更新版本及全部应聘，按时间排序并按文件 ID 去重',async()=>{
 const {candidateResumes}=await import('../src/model.js');
 const candidate={id:'c',resumes:[{id:'new',name:'new.pdf',uploadedAt:'2026-10-18T00:00:00Z'}]},apps=[{candidateId:'c',resume:{id:'old',name:'old.pdf'},history:[{at:'2026-10-17T00:00:00Z',action:'创建应聘'}]},{candidateId:'c',resume:{id:'old',name:'old.pdf'},history:[]},{candidateId:'other',resume:{id:'private'},history:[]}];
 assert.deepEqual(candidateResumes(candidate,apps).map(f=>f.id),['new','old']);assert.equal(apps[0].resume.uploadedAt,undefined);assert.deepEqual(candidateResumes(undefined,apps),[]);
});


test('待定可正式提交，保留应聘和后续安排，进度显示待定颜色且正式面评保持锁定',async()=>{
 const {terminateFailedApplication,roundTone,applicationProgress}=await import('../src/model.js');
 const app=seed().applications[0],r=app.rounds[0],f={summary:'关键能力尚需验证，交由 HR 协调后续',conclusion:'待定'};
 const before=structuredClone(app.rounds.slice(1));
 assert.throws(()=>submitFeedback(app,r,'陈晨',f,false));
 assert.throws(()=>submitFeedback(app,r,'陈晨',{...f,summary:' '},true));
 r.feedback=submitFeedback(app,r,'陈晨',f,true);
 assert.equal(r.feedback.status,'submitted');assert.equal(r.feedback.conclusion,'待定');
 assert.equal(terminateFailedApplication(app,'陈晨'),false);assert.equal(app.status,'进行中');
 assert.deepEqual(app.rounds.slice(1),before);assert.equal(roundTone(r),'pending');
 const step=applicationProgress(app).find(s=>s.id===r.id);assert.equal(step.done,true);assert.equal(step.tone,'pending');
 assert.throws(()=>submitFeedback(app,r,'陈晨',{...f,conclusion:'建议通过'},true),/锁定/);
});

test('候选人最高学历独立于学历背景，所有候选人资料必填且旧档案可读取',async()=>{
 const {validateCandidateIntake,candidateDetails}=await import('../src/model.js');
 const complete={name:'测试',phone:'13800138000',email:'test@example.com',age:'28',highestEducation:'硕士',education:'双非硕',experience:'5 年',company:'示例公司',currentTitle:'产品经理',city:'杭州',notes:'已沟通'};
 assert.equal(validateCandidateIntake(complete).highestEducation,'硕士');assert.equal(validateCandidateIntake(complete).education,'双非硕');
 for(const key of Object.keys(complete))assert.throws(()=>validateCandidateIntake({...complete,[key]:'  '}),key);
 assert.throws(()=>validateCandidateIntake({...complete,highestEducation:'双九硕'}),/最高学历/);assert.equal(candidateDetails({education:'普本'}).highestEducation,'');
});
