export const educationOptions=['双九硕','单九硕','双二硕','单二硕','双非硕','九本','211本','普本','大专'];
export function validateContacts(value){
 const phone=String(value.phone||'').trim(),email=String(value.email||'').trim();
 if(!phone&&!email)throw Error('手机号或邮箱至少填写一项');
 if(phone&&!/^1[3-9][0-9]{9}$/.test(phone))throw Error('手机号须为中国大陆 11 位手机号码');
 if(email&&(email.length>254||!email.includes('@')||email.split('@')[0].length>64||! /^[A-Za-z0-9!#$%&'*+\/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+\/=?^_`{|}~-]+)*@(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}$/.test(email)))throw Error('请填写有效邮箱，例如 name@example.com');
 return {phone,email};
}
export const canCreateApplication=(applications,candidateId)=>!applications.some(a=>a.candidateId===candidateId&&a.status==='进行中');
export const profileFields = [['age','年龄（岁）'],['education','最高学历'],['experience','工作年限'],['company','现任公司'],['currentTitle','当前职位'],['city','所在城市']];
export function candidateDetails(value,requireEducation=false){
 const details=Object.fromEntries([...profileFields.map(([key])=>key),'notes'].map(key=>[key,String(value[key]??'').trim()]));
 if(details.age&&(!/^\d+$/.test(details.age)||Number(details.age)>120))throw Error('年龄请填写 0 至 120 之间的整数，或留空');
 if(requireEducation&&!educationOptions.includes(details.education))throw Error('请选择必填的学历分类');
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
 if(r.id===app.rounds[0]?.id)validateFirstSchedule(app,data);
 if(app.status!=='进行中') throw Error('应聘已结束，不能新增或修改安排');
 if(r.feedback.status==='submitted') throw Error('已有正式面评的安排不可修改，请增加一轮面试');
 if(!data.interviewer||(people&&!people.includes(data.interviewer))||!data.time||!Number.isFinite(new Date(data.time).getTime())||!data.location.trim()) throw Error('请填写面试官、有效时间及地点或会议链接');
 if(data.mode==='线上'){let url;try{url=new URL(data.location);}catch{throw Error('请填写完整有效的会议链接');}if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw Error('会议链接须为不含账号密码的 HTTP/HTTPS 地址');}
 if(r.interviewer&&r.interviewer!==data.interviewer&&r.feedback.status!=='none') throw Error('已有面评草稿，请先保留原安排并增加一轮');
}
export function submitFeedback(app,r,person,data,completed){
 if(r.cancelled||!r.time||r.interviewer!==person) throw Error('仅本轮面试官可以提交有效安排的面评');
 if(r.feedback.status==='submitted') throw Error('面评已锁定，需 HR 退回后修改');
 if(!completed||!data.summary.trim()||!['建议通过','建议不通过','建议加面'].includes(data.conclusion)) throw Error('请填写综合评价、建议结论，并确认面试已完成');
 return {...data,status:'submitted',submittedAt:new Date().toISOString(),author:person,returnReason:r.feedback.returnReason||''};
}
export function endApplication(app,status,reason){
 if(app.status!=='进行中'||!results.slice(1).includes(status)||!reason.trim()) throw Error('请选择最终结果并填写原因');
 return {...app,status,reason,endedAt:new Date().toISOString()};
}

export function applicationStage(app,now=Date.now()){
 if(!app)return {name:'未创建应聘',detail:'可创建新的应聘记录',tone:'neutral'};
 if(app.status!=='进行中')return {name:app.status,detail:'应聘已结束',tone:app.status==='公司决定录用'?'success':app.status==='未录用'?'danger':'neutral'};
 if(needsScreening(app)&&!app.rounds[0]?.time){const s=app.screening;return {tone:s?.status==='declined'?'danger':'pending',name:s?.status==='pending'?'简历待确认':s?.status==='declined'?'简历已退回':s?.status==='accepted'?'首轮待安排':'待推送简历',detail:s?.status==='accepted'?'面试官已接受，可协调时间':s?.status==='pending'?`${s.interviewer} · 等待接受`:s?.status==='declined'?s.reason:'先指定业务面试官查看简历'};}
 const index=app.rounds.findIndex(r=>r.feedback.status!=='submitted');
 if(index<0)return {name:'待 HR 决策',detail:'所有轮次面评已提交',tone:'pending'};
 const round=app.rounds[index];
 const status=round.cancelled?'待重新安排':!round.time?'待安排':round.feedback.status==='returned'?'面评待修改':new Date(round.time).getTime()<=now?'待提交面评':'待面试';
 return {tone:roundTone(round,now),name:round.name,detail:`第 ${index+1} / ${app.rounds.length} 轮 · ${status}`,round};
}

export function roundTone(round,now=Date.now()){
 if(round.cancelled)return 'neutral';
 if(round.feedback.status==='submitted')return 'success';
 if(round.feedback.status==='returned')return 'danger';
 if(!round.time)return 'pending';
 return new Date(round.time).getTime()<=now?'feedback':'interview';
}

export const needsScreening=app=>!!app.screening||!app.rounds[0]?.time;
export function validateFirstSchedule(app,data){
 if(!needsScreening(app))return;
 if(app.screening?.status!=='accepted')throw Error('请先推送简历，由业务面试官接受后再安排首轮面试');
 if(data.interviewer!==app.screening.interviewer)throw Error('首轮须安排给已接受简历的面试官');
}
export function reviewResume(app,person,decision,reason=''){
 if(app.status!=='进行中'||app.screening?.status!=='pending'||app.screening.interviewer!==person)throw Error('该简历不在你的待确认列表中，请刷新后重试');
 if(!['accepted','declined'].includes(decision))throw Error('请选择接受面试或退回 HR');
 if(typeof reason!=='string'||reason.length>2000||(decision==='declined'&&!reason.trim()))throw Error('退回 HR 时请填写原因（不超过 2000 字）');
 return {...app.screening,status:decision,reason:decision==='declined'?reason.trim():'',reviewedAt:new Date().toISOString(),reviewedBy:person};
}

export function mergeResumeFields(current,parsed,edited=new Set(),previous={}){
 const next={...current};
 for(const key of ['name','phone','email','age','education','experience','company','currentTitle','city']){
  if(edited.has(key))continue;
  if(previous[key]&&next[key]===previous[key])next[key]='';
  if(!String(next[key]||'').trim()&&typeof parsed[key]==='string')next[key]=parsed[key];
 }
 return next;
}

export function applicationAction(app,now=Date.now()){
 if(app.status!=='进行中')return {type:'view',label:'查看结果'};
 if(needsScreening(app)&&!app.rounds[0]?.time){
  if(app.screening?.status==='pending')return {type:'view',label:'查看确认进度'};
  if(app.screening?.status==='accepted')return {type:'schedule',label:'安排首轮',roundId:app.rounds[0].id};
  return {type:'screening',label:app.screening?.status==='declined'?'重新推送':'推送简历'};
 }
 if(app.rounds.some(r=>r.time&&!r.cancelled&&r.feedback.status!=='submitted'&&new Date(r.time).getTime()>now))return {type:'view',label:'查看安排'};
 const unscheduled=app.rounds.find(r=>(!r.time||r.cancelled)&&r.feedback.status!=='submitted');
 if(unscheduled)return {type:'schedule',label:`安排${unscheduled.name}`,roundId:unscheduled.id};
 if(app.rounds.some(r=>!r.cancelled&&r.feedback.status!=='submitted'))return {type:'view',label:'查看待交面评'};
 return {type:'end',label:'记录应聘结果'};
}

export function applicationProgress(app,now=Date.now()){
 const stage=applicationStage(app,now),ended=app.status!=='进行中';
 const screened=app.screening?.status==='accepted'||!!app.rounds[0]?.time;
 return [
  {id:'screening',name:'简历确认',done:screened,active:!ended&&!screened,tone:stage.tone},
  ...app.rounds.map(r=>({id:r.id,name:r.name,done:r.feedback.status==='submitted',active:!ended&&r.feedback.status!=='submitted'&&(stage.round?.id===r.id||!!r.time&&!r.cancelled),tone:roundTone(r,now)})),
  {id:'result',name:'结果',done:ended,active:!ended&&app.rounds.every(r=>r.feedback.status==='submitted'),tone:stage.tone}
 ];
}
