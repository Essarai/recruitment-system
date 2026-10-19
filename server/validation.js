import {candidateMatches,sameCandidateContact} from '../src/intake.js';
import {normalizeScreening} from './screening.js';
import {isDeepStrictEqual as equal} from 'node:util';
import {candidateDetails,profileFields,templateNodes,validateSchedule,endApplication,validateContacts,canCreateApplication,terminateFailedApplication,stopFutureRounds} from '../src/model.js';
export function text(value,label,max=1000,required=false){if(value==null)value='';if(typeof value!=='string'||value.length>max||(required&&!value.trim()))throw Error(`${label}无效`);return value.trim();}
function array(value,label,max=5000){if(!Array.isArray(value)||value.length>max)throw Error(`${label}无效`);return value;}
function id(value){return text(value,'记录 ID',80,true);}
function unique(records,label){if(new Set(records.map(x=>x.id)).size!==records.length)throw Error(`${label}含重复 ID`);}
function preserve(previous,next,label){if(previous.some(x=>!next.some(y=>y.id===x.id)))throw Error(`不能删除已有${label}`);}
const scheduleKeys=['interviewer','time','mode','location','focus'];
export function validateHRState(previous,input,interviewers,files,actor,activeInterviewers=interviewers){
 const now=new Date().toISOString();
 const candidates=array(input.candidates,'候选人').map(c=>{
  const old=previous.candidates.find(x=>x.id===c.id);if(old&&equal(old,c))return structuredClone(old);
  const {resumes,...profile}=c,{resumes:oldResumes,...oldProfile}=old||{};
  const result=old&&equal(oldProfile,profile)?structuredClone(old):{id:id(c.id),name:text(c.name,'姓名',100,true),...validateContacts({phone:text(c.phone,'手机号',64),email:text(c.email,'邮箱',254)}),...candidateDetails(c,true)};
  for(const [key] of profileFields)text(result[key],key,200);text(result.notes,'备注',2000);
  if(resumes||oldResumes){
   const versions=array(resumes||[],'简历版本',500);unique(versions,'简历版本');preserve(oldResumes||[],versions,'简历版本');
   result.resumes=versions.map(reference=>{
    const file=files.find(f=>f.id===reference.id);if(!file)throw Error('简历附件不存在，请重新上传');
    return {id:file.id,name:file.name,type:file.mime,size:file.size,uploadedAt:oldResumes?.find(f=>f.id===file.id)?.uploadedAt||now};
   });
  }
  return result;
 });
 unique(candidates,'候选人');preserve(previous.candidates,candidates,'候选人');
 for(const candidate of candidates)if(!previous.candidates.some(c=>c.id===candidate.id)&&candidateMatches(candidates,candidate).some(other=>sameCandidateContact(other,candidate)))throw Error('手机号或邮箱已存在，请打开原候选人档案并更新简历');
 const templates=array(input.templates,'流程模板',100).map(t=>{
  const nodes=templateNodes(array(t.nodes,'流程节点',50),interviewers),old=previous.templates.find(x=>x.id===t.id);
  if(nodes.some((n,i)=>n.interviewer&&!activeInterviewers.includes(n.interviewer)&&old?.nodes[i]?.interviewer!==n.interviewer))throw Error('不能将已冻结账号设为默认面试官');
  const reviewer=text(t.reviewer,'默认简历确认人',100);if(reviewer&&(!interviewers.includes(reviewer)||(!activeInterviewers.includes(reviewer)&&old?.reviewer!==reviewer)))throw Error('请选择启用的简历确认人');
  return {id:id(t.id),name:text(t.name,'流程名称',100,true),jd:text(t.jd,'JD',20000),...(reviewer?{reviewer}:{}),nodes};
 });
 unique(templates,'模板');preserve(previous.templates,templates,'模板');
 const roundIds=new Set();const newApplicants=new Set();
 const applications=array(input.applications,'应聘记录').map(a=>{
  const old=previous.applications.find(x=>x.id===a.id);const candidateId=id(a.candidateId);
  if(!candidates.some(c=>c.id===candidateId))throw Error('应聘关联的候选人不存在');
  const next={id:id(a.id),candidateId,templateId:old?.templateId,job:text(a.job,'岗位',160,true),...(old?.jd!==undefined?{jd:old.jd}:{}),status:a.status,reason:text(a.reason,'结束原因',2000),endedAt:old?.endedAt||undefined,resume:null,rounds:[],history:old?.history||[]};
  if(old&&(old.candidateId!==candidateId||old.job!==next.job))throw Error('不能更换已有应聘的候选人或岗位');
  if(old){if(old.status!==a.status){const ended=endApplication(old,a.status,next.reason);next.endedAt=ended.endedAt;}else if(old.reason!==next.reason)throw Error('不能改写已保存的结束原因');}
  else if(a.status!=='进行中'||next.reason)throw Error('新应聘必须为进行中');
  if(!old){if(!canCreateApplication(previous.applications,candidateId)||newApplicants.has(candidateId))throw Error('该候选人已有进行中的应聘，请先结束现有流程');newApplicants.add(candidateId);const template=templates.find(t=>t.id===a.templateId);if(!template||a.job!==template.name)throw Error('应聘岗位必须来自所选流程名称');if(!Array.isArray(a.rounds)||a.rounds.length!==template.nodes.length||a.rounds.some((r,i)=>r.name!==template.nodes[i].name))throw Error('面试节点须与所选流程一致');next.templateId=template.id;next.jd=template.jd;candidateDetails(candidates.find(c=>c.id===candidateId),true);}
  if(!a.resume?.id)throw Error('每次应聘必须关联已上传的简历');
  const file=files.find(f=>f.id===a.resume.id);if(!file)throw Error('简历附件不存在，请重新上传');
  next.resume={id:file.id,name:file.name,size:file.size,type:file.mime};
  if(old&&!equal(old.resume,next.resume))throw Error('已有应聘的简历版本不能覆盖，请创建新的应聘记录');
  const screening=normalizeScreening(old,a,interviewers,actor);if(screening?.interviewer&&!equal(old?.screening,screening)&&!activeInterviewers.includes(screening.interviewer))throw Error('不能向已冻结的面试官推送简历');if(screening)next.screening=screening;
  next.rounds=array(a.rounds,'面试轮次',50).map((r,index)=>{
   const oldRound=old?.rounds.find(x=>x.id===r.id);
   const result={id:id(r.id),name:text(r.name,'轮次名称',100,true),interviewer:text(r.interviewer,'面试官',100),time:text(r.time,'面试时间',40),mode:text(r.mode,'面试方式',10),location:text(r.location,'会议链接或地点',2000),focus:text(r.focus,'考察重点',2000),cancelled:r.cancelled===true,feedback:oldRound?.feedback||{status:'none',summary:'',strengths:'',concerns:'',conclusion:''}};
   if(roundIds.has(result.id))throw Error('面试节点 ID 不能重复');roundIds.add(result.id);
   if(!['线上','线下'].includes(result.mode))throw Error('请选择面试方式');
   if(result.interviewer&&!interviewers.includes(result.interviewer))throw Error('面试官账号不存在');
   if(oldRound&&oldRound.name!==result.name)throw Error('不能改写已有轮次名称');
   if(oldRound?.feedbackVersions)result.feedbackVersions=oldRound.feedbackVersions;
   const changed=!oldRound||scheduleKeys.some(k=>oldRound[k]!==result[k])||(oldRound.cancelled&&!result.cancelled);
   if(changed){
    if(result.interviewer&&!activeInterviewers.includes(result.interviewer))throw Error('不能为已冻结的面试官新增或修改安排');
    if(old?.status!=='进行中'&&old)throw Error('应聘已结束，不能变更安排');
    if(result.time){validateSchedule(old?{...old,screening:next.screening}:next,oldRound||result,result,interviewers);}
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
   return result;
  });
  if(!next.rounds.length)throw Error('至少保留一个面试节点');
  if(old){preserve(old.rounds,next.rounds,'面试节点');if(old.rounds.some((r,i)=>next.rounds[i]?.id!==r.id))throw Error('不能调整已有面试轮次顺序');if(old.status!=='进行中'&&next.rounds.length!==old.rounds.length)throw Error('应聘已结束，不能加面');}
  const compare=x=>{const {history,...record}=x;return JSON.parse(JSON.stringify(record));};
  if(!old||!equal(compare(old),compare(next))){
   const changes=old?next.rounds.flatMap(r=>{const before=old.rounds.find(x=>x.id===r.id);if(!before)return [`新增 ${r.name}`];const fields=[...scheduleKeys,'cancelled'];const updates=fields.filter(k=>before[k]!==r[k]).map(k=>`${k}: ${before[k]||'空'} → ${r[k]||'空'}`);if(r.feedback.status!==before.feedback.status)updates.push(`面评: ${before.feedback.status} → ${r.feedback.status}${r.feedback.returnReason?'；'+r.feedback.returnReason:''}`);return updates.length?[`${r.name}（${updates.join('；')}）`]:[];}):[];
   next.history=[{at:now,actor,action:!old?'创建应聘':old.status!==next.status?`结束应聘：${next.status}；${next.reason}`:(!equal(old?.screening,next.screening)?`推送简历给 ${next.screening?.interviewer||'待指定'}`:changes.join('；'))||'更新应聘记录'},...next.history];
  }
  if(old?.status==='进行中'&&['未录用','候选人退出'].includes(next.status))stopFutureRounds(next,now);
  terminateFailedApplication(next,actor);
  return next;
 });
 unique(applications,'应聘记录');preserve(previous.applications,applications,'应聘记录');
 return {candidates,templates,applications};
}
