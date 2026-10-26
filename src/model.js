import {reviewSourceValid} from './round-review.js';
export const highestEducationOptions=['博士','硕士','本科','大专'];
export const educationOptions=['双九硕','单九硕','双二硕','单二硕','双非硕','九本','211本','普本','大专'];
export function validateContacts(value){
 const phone=String(value.phone||'').trim(),email=String(value.email||'').trim();
 if(!phone&&!email)throw Error('手机号或邮箱至少填写一项');
 if(phone&&!/^1[3-9][0-9]{9}$/.test(phone))throw Error('手机号须为中国大陆 11 位手机号码');
 if(email&&(email.length>254||!email.includes('@')||email.split('@')[0].length>64||! /^[A-Za-z0-9!#$%&'*+\/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+\/=?^_`{|}~-]+)*@(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}$/.test(email)))throw Error('请填写有效邮箱，例如 name@example.com');
 return {phone,email};
}
export const canCreateApplication=(applications,candidateId)=>!applications.some(a=>a.candidateId===candidateId&&a.status==='进行中');
export const profileFields = [['age','年龄（岁）'],['highestEducation','最高学历'],['education','学历背景'],['experience','工作年限'],['company','现任公司'],['currentTitle','当前职位'],['city','所在城市']];
export function candidateDetails(value,requireEducation=false){
 const details=Object.fromEntries([...profileFields.map(([key])=>key),'notes'].map(key=>[key,String(value[key]??'').trim()]));
 if(details.age&&(!/^\d+$/.test(details.age)||Number(details.age)>120))throw Error('年龄请填写 0 至 120 之间的整数');
 if(details.highestEducation&&!highestEducationOptions.includes(details.highestEducation))throw Error('请选择有效的最高学历');
 if(requireEducation&&!educationOptions.includes(details.education))throw Error('请选择必填的学历分类');
 return details;
}
export const hrNotesLength=value=>Array.from(String(value??'').replace(/\s/g,'')).length;
export function validateHRNotes(value){
 const notes=String(value??'').trim(),length=hrNotesLength(notes);
 if(length<20)throw Error('请补充 HR 前置沟通记录，至少 20 字（不计空白），记录实际沟通内容与初步判断');
 if(length>500||notes.length>2000)throw Error('HR 前置沟通记录最多 500 字（不计空白）');
 return notes;
}
export function validateCandidateIntake(value){
 const details=candidateDetails(value,true);
 for(const [key,label] of [['name','姓名'],['phone','手机号'],['email','邮箱'],...profileFields,['notes','HR 备注']])if(!String(value[key]??'').trim())throw Error(`请填写${label}`);
 validateContacts(value);
 details.notes=validateHRNotes(details.notes);
 return details;
}
export const results = ['进行中','公司决定录用','未录用','候选人退出'];
export const uid = () => crypto.randomUUID();
export const blankFeedback = () => ({summary:'', strengths:'', concerns:'', conclusion:'', status:'none'});
export const round = node => ({id:uid(),name:typeof node==='string'?node:node.name,interviewer:typeof node==='string'?'':node.interviewer||'',time:'',mode:'线上',location:'',focus:'',cancelled:false,feedback:blankFeedback()});
export function templateNodes(nodes,people=null){
 if(!Array.isArray(nodes)||!nodes.length)throw Error('请添加至少一个面试节点');
 const normalized=nodes.map(node=>({name:String(typeof node==='string'?node:node.name||'').trim(),interviewer:typeof node==='string'?'':node.interviewer||''}));
 if(normalized.some(n=>!n.name))throw Error('请填写每个节点的名称');
 if(new Set(normalized.map(n=>n.name)).size!==normalized.length)throw Error('节点名称不能重复');
 if(normalized.some(n=>n.interviewer&&people&&!people.includes(n.interviewer)))throw Error('请选择有效的默认面试官');
 return normalized;
}
export const roundsFromTemplate = template => templateNodes(template.nodes).map(round);
export const pending = app => app.rounds.filter(r=>r.time&&!r.cancelled&&r.feedback.status!=='submitted').length;
export const nextInterview = app => app.status!=='进行中'?null:app.rounds.filter(r=>r.time&&!r.cancelled&&r.feedback.status!=='submitted'&&new Date(r.time)>new Date()).sort((a,b)=>a.time.localeCompare(b.time))[0];
export function validateSchedule(app,r,data,people=null){
 validateResumeConfirmation(app);
 if(app.status!=='进行中') throw Error('应聘已结束，不能新增或修改安排');
 if(app.rounds.findIndex(x=>x.id===r.id)>0&&(!r.time||r.review)){if(r.review?.status!=='accepted'||!reviewSourceValid(app,r))throw Error('请先完成本轮简历审核，再安排面试');if(data.interviewer!==r.review.interviewer)throw Error('更换面试官后须重新审核简历');}
 if(r.feedback.status==='submitted') throw Error('已有正式面评的安排不可修改，请增加一轮面试');
 if(!data.interviewer||(people&&!people.includes(data.interviewer))||!data.time||!Number.isFinite(new Date(data.time).getTime())||!data.location.trim()) throw Error('请填写面试官、有效时间及地点或会议链接');
 if(data.mode==='线上'){let url;try{url=new URL(data.location);}catch{throw Error('请填写完整有效的会议链接');}if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw Error('会议链接须为不含账号密码的 HTTP/HTTPS 地址');}
 if(r.interviewer&&r.interviewer!==data.interviewer&&r.feedback.status!=='none') throw Error('已有面评草稿，请先保留原安排并增加一轮');
}
export function submitFeedback(app,r,person,data,completed){
 if(r.cancelled||!r.time||r.interviewer!==person) throw Error('仅本轮面试官可以提交有效安排的面评');
 if(r.feedback.status==='submitted') throw Error('面评已锁定，需 HR 退回后修改');
 if(!completed||!data.summary.trim()||!['建议通过','建议不通过','建议加面','待定'].includes(data.conclusion)) throw Error('请填写综合评价、建议结论，并确认面试已完成');
 return {...data,status:'submitted',submittedAt:new Date().toISOString(),author:person,returnReason:r.feedback.returnReason||''};
}
export function endApplication(app,status,reason){
 if(app.status!=='进行中'||!results.slice(1).includes(status)||!reason.trim()) throw Error('请选择最终结果并填写原因');
 const ended={...app,status,reason,endedAt:new Date().toISOString(),rounds:app.rounds.map(r=>({...r}))};
 if(status!=='公司决定录用')stopFutureRounds(ended);return ended;
}

export function applicationStage(app,now=Date.now()){
 if(!app)return {name:'未创建应聘',detail:'可创建新的应聘记录',tone:'neutral'};
 if(app.status!=='进行中')return {name:applicationStatus(app),detail:app.reason||'应聘已结束',tone:app.withdrawnAt?'neutral':app.status==='公司决定录用'?'success':app.status==='未录用'?'danger':'neutral'};
 if(needsScreening(app)&&!app.rounds[0]?.time){const s=app.screening;return {tone:s?.status==='declined'?'danger':'pending',name:s?.status==='pending'?'简历待确认':s?.status==='declined'?'简历已退回':s?.status==='accepted'?'首轮待安排':'待推送简历',detail:s?.status==='accepted'?'简历确认已通过，可安排面试':s?.status==='pending'?`${s.interviewer} · 等待确认`:s?.status==='declined'?s.reason:'先指定简历确认人'};}
 const index=app.rounds.findIndex(r=>r.feedback.status!=='submitted');
 if(index<0)return {name:'待 HR 决策',detail:'所有轮次面评已提交',tone:'pending'};
 const round=app.rounds[index];
 const status=round.review?.status==='pending'?`等待 ${round.review.interviewer||'HR 指定面试官'} 审核简历`:round.cancelled?'待重新安排':!round.time?'待安排':round.feedback.status==='returned'?'待提交':new Date(round.time).getTime()<=now?'待提交面评':'待面试';
 return {tone:roundTone(round,now),name:round.name,detail:`第 ${index+1} / ${app.rounds.length} 轮 · ${status}`,round};
}

export function roundTone(round,now=Date.now()){
 if(round.cancelled)return 'neutral';
 if(round.feedback.status==='submitted')return round.feedback.conclusion==='建议不通过'?'danger':round.feedback.conclusion==='待定'?'pending':'success';
 if(round.feedback.status==='returned')return 'feedback';
 if(!round.time)return 'pending';
 return new Date(round.time).getTime()<=now?'feedback':'interview';
}

export const needsScreening=app=>app.screening?.status!=='skipped'&&(!!app.screening||!app.rounds[0]?.time);
export function validateResumeConfirmation(app){
 if(!needsScreening(app))return;
 if(app.screening?.status!=='accepted')throw Error('请先完成独立的简历确认，再安排面试');
}
export function reviewResume(app,person,decision,reason=''){
 if(app.status!=='进行中'||app.screening?.status!=='pending'||app.screening.interviewer!==person)throw Error('该简历不在你的待确认列表中，请刷新后重试');
 if(!['accepted','declined'].includes(decision))throw Error('请选择确认通过或不通过');
 if(typeof reason!=='string'||reason.length>2000||(decision==='declined'&&!reason.trim()))throw Error('不通过时请填写原因（不超过 2000 字）');
 return {...app.screening,status:decision,reason:decision==='declined'?reason.trim():'',reviewedAt:new Date().toISOString(),reviewedBy:person};
}

export function mergeResumeFields(current,parsed,edited=new Set(),previous={}){
 const next={...current};
 for(const key of ['name','phone','email','age','highestEducation','education','experience','company','currentTitle','city']){
  if(edited.has(key))continue;
  if(previous[key]&&next[key]===previous[key])next[key]='';
  if(!String(next[key]||'').trim()&&typeof parsed[key]==='string')next[key]=parsed[key];
 }
 return next;
}


export function applicationProgress(app,now=Date.now()){
 const stage=applicationStage(app,now),ended=app.status!=='进行中';
 const screened=app.screening?.status==='accepted'||!!app.rounds[0]?.time;
 return [
  ...(app.screening?.status==='skipped'?[]:[{id:'screening',name:'简历确认',done:screened,active:!ended&&!screened,tone:stage.tone}]),
  ...app.rounds.map(r=>({id:r.id,name:r.name,done:r.feedback.status==='submitted',active:!ended&&r.feedback.status!=='submitted'&&(stage.round?.id===r.id||!!r.time&&!r.cancelled),tone:roundTone(r,now)})),
  {id:'result',name:'结果',done:ended,active:!ended&&app.rounds.every(r=>r.feedback.status==='submitted'),tone:stage.tone}
 ];
}

export const applicationStatus=app=>app.withdrawnAt?'已撤回':app.status==='公司决定录用'?'已录用':['未录用','候选人退出'].includes(app.status)?'流程终止':'进行中';
export function applicationFailure(app){
 if(app.screening?.status==='declined')return {reason:`简历筛选不通过：${app.screening.reason}`,at:app.screening.reviewedAt};
 const round=app.rounds.find(r=>r.feedback.status==='submitted'&&r.feedback.conclusion==='建议不通过');
 return round?{reason:`${round.name}不通过：${round.feedback.summary}`,at:round.feedback.submittedAt}:null;
}
export function terminateFailedApplication(app,actor='系统',now=new Date().toISOString()){
 if(app.status!=='进行中')return false;
 const failure=applicationFailure(app);if(!failure)return false;
 app.status='未录用';app.reason=failure.reason;app.endedAt=failure.at||now;
 stopFutureRounds(app,now);
 app.history=[{at:now,actor,action:`流程终止：${failure.reason}`},...(app.history||[])];return true;
}

export function stopFutureRounds(app,now=new Date().toISOString()){
 for(const r of app.rounds)if(r.feedback.status!=='submitted'&&(!r.time||new Date(r.time)>new Date(now)))r.cancelled=true;
}

export function candidateResumes(candidate,applications){
 const seen=new Set(),versions=[...(candidate?.resumes||[]),...applications.filter(a=>a.candidateId===candidate?.id&&a.resume?.id).map(a=>({...a.resume,uploadedAt:a.history?.find(h=>h.action.startsWith('创建应聘'))?.at||''}))];
 return versions.sort((a,b)=>(Date.parse(b.uploadedAt)||0)-(Date.parse(a.uploadedAt)||0)).filter(file=>file?.id&&!seen.has(file.id)&&seen.add(file.id));
}

export function workExperienceLabel(value){
 const text=String(value??'').trim();if(!text)return '';
 if(/^\d+(?:\.\d+)?$/.test(text))return `${text} 年工作经验`;
 if(/^\d+(?:\.\d+)?\s*(?:年|years?)(?:以上|以下|左右)?$/i.test(text))return `${text.replace(/years?/i,'年')}工作经验`;
 return /工作经验|工作经历/.test(text)?text:`工作经验：${text}`;
}

export function newestApplications(applications){
 return applications.map(app=>{const times=(app.history||[]).filter(h=>h.action?.startsWith('创建应聘')).map(h=>Date.parse(h.at)).filter(Number.isFinite);return {app,time:times.length?Math.min(...times):-Infinity};})
  .sort((a,b)=>a.time===b.time?0:b.time-a.time).map(row=>row.app);
}

export const canDeleteInterviewRound=(app,r)=>app.status==='进行中'&&app.rounds.length>1&&!r.time&&!r.scheduleEvents?.length&&r.feedback.status==='none'&&!r.feedbackVersions?.length&&!r.feedback.transcript&&!r.review;
