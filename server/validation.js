import {activateRoundReviews} from '../src/round-review.js';
import {applicationCreatorName} from '../src/permissions.js';
import {canManageApplication} from '../src/permissions.js';
import {candidateMatches,sameCandidateContact} from '../src/intake.js';
import {normalizeScreening} from './screening.js';
import {isDeepStrictEqual as equal} from 'node:util';
import {validateHREndApplication,canDeleteInterviewRound,calendarSources,candidateDetails,validateHRNotes,validateCandidateIntake,profileFields,templateNodes,validateSchedule,endApplication,validateContacts,canCreateApplication,terminateFailedApplication,stopFutureRounds} from '../src/model.js';
export function text(value,label,max=1000,required=false){if(value==null)value='';if(typeof value!=='string'||value.length>max||(required&&!value.trim()))throw Error(`${label}无效`);return value.trim();}
function array(value,label,max=5000){if(!Array.isArray(value)||value.length>max)throw Error(`${label}无效`);return value;}
function id(value){return text(value,'记录 ID',80,true);}
function unique(records,label){if(new Set(records.map(x=>x.id)).size!==records.length)throw Error(`${label}含重复 ID`);}
function preserve(previous,next,label){const ids=new Set(next.map(x=>x.id));if(previous.some(x=>!ids.has(x.id)))throw Error(`不能删除已有${label}`);}
const scheduleKeys=['interviewer','time','mode','location','focus','duration','calendarSource'];
export function validateHRState(previous,input,interviewers,files,actor,activeInterviewers=interviewers,actorUser=null){
 const now=new Date().toISOString();
 const oldCandidates=new Map(previous.candidates.map(c=>[c.id,c]));
 const oldApplications=new Map(previous.applications.map(a=>[a.id,a]));
 const candidates=array(input.candidates,'候选人',20000).map(c=>{
  const old=oldCandidates.get(c.id);if(old&&equal(old,c))return structuredClone(old);
  const {resumes,...profile}=c,{resumes:oldResumes,...oldProfile}=old||{};
  const result=old&&equal(oldProfile,profile)?structuredClone(old):{id:id(c.id),name:text(c.name,'姓名',100,true),...validateContacts({phone:text(c.phone,'手机号',64),email:text(c.email,'邮箱',254)}),...validateCandidateIntake(c)};
  for(const [key] of profileFields)text(result[key],key,200);text(result.notes,'备注',2000);
  if(resumes||oldResumes){
   const versions=array(resumes||[],'简历版本',500);unique(versions,'简历版本');preserve(oldResumes||[],versions,'简历版本');
   result.resumes=versions.map(reference=>{
    const file=files.find(f=>f.id===reference.id);if(!file)throw Error('简历附件不存在，请重新上传');
    return {id:file.id,name:file.name,type:file.mime,size:file.size,uploadedAt:oldResumes?.find(f=>f.id===file.id)?.uploadedAt||now};
   });
  }
  if(old?.createdBy)result.createdBy=old.createdBy;else if(!old&&actorUser)result.createdBy=actorUser.id;
  if(old?.createdAt)result.createdAt=old.createdAt;else if(!old)result.createdAt=now;
  return result;
 });
 unique(candidates,'候选人');preserve(previous.candidates,candidates,'候选人');
 for(const candidate of candidates)if(!oldCandidates.has(candidate.id)&&candidateMatches(candidates,candidate).some(other=>sameCandidateContact(other,candidate)))throw Error('手机号或邮箱已存在，请打开原候选人档案并更新简历');
 if(actorUser?.role==='HR'&&!equal(previous.templates,input.templates))throw Object.assign(Error('仅管理员可以维护流程模板'),{status:403});
 const templates=actorUser?.role==='HR'?structuredClone(previous.templates):array(input.templates,'流程模板',100).map(t=>{
  const old=previous.templates.find(x=>x.id===t.id);if(old&&equal(old,t))return structuredClone(old);
  const nodes=templateNodes(array(t.nodes,'流程节点',50));
  if(nodes.some((n,i)=>n.interviewer&&!interviewers.includes(n.interviewer)&&old?.nodes[i]?.interviewer!==n.interviewer))throw Error('请选择有效的默认面试官');
  if(nodes.some((n,i)=>n.interviewer&&!activeInterviewers.includes(n.interviewer)&&old?.nodes[i]?.interviewer!==n.interviewer))throw Error('不能将已冻结账号设为默认面试官');
  const reviewer=text(t.reviewer,'默认简历确认人',100);if(reviewer&&old?.reviewer!==reviewer&&(!interviewers.includes(reviewer)||!activeInterviewers.includes(reviewer)))throw Error('请选择启用的简历确认人');
  return {id:id(t.id),name:text(t.name,'流程名称',100,true),jd:text(t.jd,'JD',20000),...(reviewer?{reviewer}:{}),nodes};
 });
 unique(templates,'模板');if(actorUser?.role!=='admin')preserve(previous.templates,templates,'流程模板');
 const roundIds=new Set();const newApplicants=new Set();
 const applications=array(input.applications,'应聘记录').map(a=>{
  const old=oldApplications.get(a.id);const candidateId=id(a.candidateId);
  if(old&&equal(old,a)){
   for(const r of old.rounds){if(roundIds.has(r.id))throw Error('面试节点 ID 不能重复');roundIds.add(r.id);}
   return structuredClone(old);
  }
  if(old&&actorUser&&!canManageApplication(actorUser,old)){
   const expected=structuredClone(old);for(const r of expected.rounds)if(['none','draft','returned'].includes(r.feedback.status))r.feedback={status:r.feedback.status,returnReason:r.feedback.returnReason||''};
   const comparable=value=>{const {history,...rest}=value;return JSON.parse(JSON.stringify(rest));};
   if(!equal(comparable(expected),comparable(a)))throw Object.assign(Error('仅创建该应聘的 HR 或管理员可以操作，其他 HR 仅可查看'),{status:403});
   for(const r of old.rounds){if(roundIds.has(r.id))throw Error('面试节点 ID 不能重复');roundIds.add(r.id);}
   return structuredClone(old);
  }
  if(!candidates.some(c=>c.id===candidateId))throw Error('应聘关联的候选人不存在');
  const next={...(old?.archivedAt?{archivedAt:old.archivedAt,archivedBy:old.archivedBy}:{}),...(old?.withdrawnAt?{withdrawnAt:old.withdrawnAt,withdrawnBy:old.withdrawnBy}:{}),...(old?.createdBy?{createdBy:old.createdBy}:!old&&actorUser?{createdBy:actorUser.id}:{}),id:id(a.id),candidateId,templateId:old?.templateId,job:text(a.job,'岗位',160,true),...(old?.jd!==undefined?{jd:old.jd}:{}),status:a.status,reason:text(a.reason,'结束原因',2000),endedAt:old?.endedAt||undefined,resume:null,rounds:[],history:old?.history||[]};
  if(old&&(old.candidateId!==candidateId||old.job!==next.job))throw Error('不能更换已有应聘的候选人或岗位');
  if(old){if(old.status!==a.status){validateHREndApplication(old);const ended=endApplication(old,a.status,next.reason);next.endedAt=ended.endedAt;}else if(old.reason!==next.reason)throw Error('不能改写已保存的结束原因');}
  else if(a.status!=='进行中'||next.reason)throw Error('新应聘必须为进行中');
  if(!old){if(!canCreateApplication(previous.applications,candidateId)||newApplicants.has(candidateId))throw Error('该候选人已有进行中的应聘，请先结束现有流程');newApplicants.add(candidateId);const template=templates.find(t=>t.id===a.templateId);if(!template||a.job!==template.name)throw Error('应聘岗位必须来自所选流程名称');if(!Array.isArray(a.rounds)||a.rounds.length!==template.nodes.length||a.rounds.some((r,i)=>r.name!==template.nodes[i].name))throw Error('面试节点须与所选流程一致');next.templateId=template.id;next.jd=template.jd;candidateDetails(candidates.find(c=>c.id===candidateId),true);validateHRNotes(candidates.find(c=>c.id===candidateId).notes);}
  if(!a.resume?.id)throw Error('每次应聘必须关联已上传的简历');
  const file=files.find(f=>f.id===a.resume.id);if(!file)throw Error('简历附件不存在，请重新上传');
  next.resume={id:file.id,name:file.name,size:file.size,type:file.mime};
  if(old&&!equal(old.resume,next.resume))throw Error('已有应聘的简历版本不能覆盖，请创建新的应聘记录');
  const screening=normalizeScreening(old,a,interviewers,actor);if(screening?.interviewer&&!equal(old?.screening,screening)&&!activeInterviewers.includes(screening.interviewer))throw Error('不能向已冻结的面试官推送简历');if(screening)next.screening=screening;
  next.rounds=array(a.rounds,'面试轮次',50).map((r,index)=>{
   const oldRound=old?.rounds.find(x=>x.id===r.id);
   const result={id:id(r.id),name:text(r.name,'轮次名称',100,true),interviewer:text(r.interviewer,'面试官',100),time:text(r.time,'面试时间',40),mode:text(r.mode,'面试方式',10),location:text(r.location,'会议链接或地点',2000),focus:text(r.focus,'考察重点',2000),cancelled:r.cancelled===true,feedback:oldRound?.feedback||{status:'none',summary:'',strengths:'',concerns:'',conclusion:''}};
   if(r.calendarSource!==undefined){if(typeof r.calendarSource!=='string'||!Object.hasOwn(calendarSources,r.calendarSource))throw Error('请选择有效的日程来源');if(r.calendarSource!=='system'||!oldRound||oldRound.calendarSource!==undefined)result.calendarSource=r.calendarSource;}else if(oldRound?.calendarSource!==undefined)result.calendarSource=oldRound.calendarSource;
   if(r.duration!==undefined){if(!Number.isInteger(r.duration)||r.duration<15||r.duration>240||r.duration%15)throw Error('面试时长须为 15～240 分钟，且为 15 分钟的倍数');result.duration=r.duration;}else if(oldRound?.duration!==undefined)result.duration=oldRound.duration;
   if(roundIds.has(result.id))throw Error('面试节点 ID 不能重复');roundIds.add(result.id);
   if(!['线上','线下'].includes(result.mode))throw Error('请选择面试方式');
   if(result.interviewer&&!interviewers.includes(result.interviewer)&&oldRound?.interviewer!==result.interviewer)throw Error('面试官账号不存在');
   if(oldRound&&oldRound.name!==result.name)throw Error('不能改写已有轮次名称');
   if(oldRound?.review){result.review=structuredClone(oldRound.review);if(oldRound.interviewer!==result.interviewer){if(oldRound.time||oldRound.feedback.status!=='none')throw Error('已有安排或面评，不能更换审核面试官');result.review={...result.review,status:'pending',interviewer:result.interviewer,reason:'',sentAt:now};delete result.review.reviewedAt;delete result.review.reviewedBy;}}else if(r.review)throw Error('不能伪造轮次审核结果');
   if(r.hrProgression!==undefined&&!equal(r.hrProgression,oldRound?.hrProgression))throw Error('不能伪造或改写 HR 推进决定');
   if(oldRound?.hrProgression)result.hrProgression=structuredClone(oldRound.hrProgression);
   if(oldRound?.feedbackVersions)result.feedbackVersions=oldRound.feedbackVersions;
   if(oldRound?.scheduleEvents)result.scheduleEvents=structuredClone(oldRound.scheduleEvents);
   const changed=!oldRound||scheduleKeys.some(k=>oldRound[k]!==result[k])||(oldRound.cancelled&&!result.cancelled);
   if(changed){
    if(result.interviewer&&!activeInterviewers.includes(result.interviewer))throw Error(interviewers.includes(result.interviewer)?'不能为已冻结的面试官新增或修改安排':'该账号已不再是面试官，请重新指定面试官');
    if(old?.status!=='进行中'&&old)throw Error('应聘已结束，不能变更安排');
    if(result.time){if(index>0&&!oldRound)throw Error('新增轮次须先完成本轮简历审核，再安排面试');validateSchedule(old?{...old,screening:next.screening}:next,oldRound||result,result,interviewers);}
    else if(oldRound?.time||result.location||result.focus)throw Error('请完整填写面试安排');
   }
   if(result.cancelled&&!oldRound)throw Error('新节点不能直接取消');
   if(result.cancelled&&oldRound?.feedback.status==='submitted')throw Error('已有正式面评不能取消');
   if(!oldRound&&r.feedback?.status!=='none')throw Error('HR 不能代录面评');
   if(oldRound&&r.feedback?.status!==oldRound.feedback.status){
    if(oldRound.feedback.status!=='submitted'||r.feedback?.status!=='returned')throw Error('HR 不能代录或清除面评');
    const reason=text(r.feedback.returnReason,'退回原因',2000,true);
    result.feedbackVersions=[...(oldRound.feedbackVersions||[]),structuredClone(oldRound.feedback)];
    result.feedback={...oldRound.feedback,status:'returned',returnReason:reason};
   }else if(oldRound?.feedback.status==='submitted'&&!equal(r.feedback,oldRound.feedback))throw Error('不能改写面试官的正式面评');
   if(actorUser){
    const type=result.cancelled&&!oldRound?.cancelled&&next.status==='进行中'?'cancelled':!result.cancelled&&result.time&&(!oldRound?.time||oldRound.cancelled)?'created':!result.cancelled&&result.time&&['interviewer','time','mode','location','duration'].some(key=>oldRound?.[key]!==result[key])?'rescheduled':oldRound?.calendarSource!==result.calendarSource?'calendarSourceChanged':null;
    if(type)result.scheduleEvents=[...(result.scheduleEvents||[]),{type,at:now,actorId:actorUser.id,actorName:actorUser.name}];
   }
   return result;
  });
  if(!next.rounds.length)throw Error('至少保留一个面试节点');
  if(old){const removed=old.rounds.filter(r=>!next.rounds.some(n=>n.id===r.id));if(removed.some(r=>!canDeleteInterviewRound(old,r)))throw Error('仅可删除未安排且无面评记录的轮次');const retained=old.rounds.filter(r=>next.rounds.some(n=>n.id===r.id));if(retained.some((r,i)=>next.rounds[i]?.id!==r.id))throw Error('不能调整已有面试轮次顺序');if(old.status!=='进行中'&&next.rounds.length!==old.rounds.length)throw Error('应聘已结束，不能加面');}
  activateRoundReviews(next,applicationCreatorName(old||next,actorUser?[actorUser]:[]),now);
  const compare=x=>{const {history,...record}=x;return JSON.parse(JSON.stringify(record));};
  if(!old||!equal(compare(old),compare(next))){
   const changes=old?[...old.rounds.filter(r=>!next.rounds.some(n=>n.id===r.id)).map(r=>`删除面试轮次：${r.name}`),...next.rounds.flatMap(r=>{const before=old.rounds.find(x=>x.id===r.id);if(!before)return [`新增 ${r.name}`];const fields=[...scheduleKeys,'cancelled'];const updates=fields.filter(k=>before[k]!==r[k]).map(k=>k==='calendarSource'?`日程来源：${calendarSources[before[k]||'system']} → ${calendarSources[r[k]||'system']}`:`${k}: ${before[k]||'空'} → ${r[k]||'空'}`);if(r.feedback.status!==before.feedback.status)updates.push(`面评: ${before.feedback.status} → ${r.feedback.status}${r.feedback.returnReason?'；'+r.feedback.returnReason:''}`);return updates.length?[`${r.name}（${updates.join('；')}）`]:[];})]:[];
   next.history=[{at:now,actor,action:!old?(next.screening?.status==='skipped'?'创建应聘（无需简历确认）':'创建应聘'):old.status!==next.status?`结束应聘：${next.status}；${next.reason}`:(!equal(old?.screening,next.screening)?`推送简历给 ${next.screening?.interviewer||'待指定'}`:changes.join('；'))||'更新应聘记录'},...next.history];
  }
  if(old?.status==='进行中'&&['未录用','候选人退出'].includes(next.status))stopFutureRounds(next,now);
  terminateFailedApplication(next,actor);
  return next;
 });
 unique(applications,'应聘记录');preserve(previous.applications,applications,'应聘记录');
 return {candidates,templates,applications};
}
