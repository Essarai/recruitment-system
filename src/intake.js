import {uid,candidateDetails,candidateResumes,canCreateApplication,roundsFromTemplate} from './model.js';
const normalized=value=>String(value||'').trim().toLowerCase();
export function candidateMatches(candidates,fields){
 return candidates.filter(c=>c.id!==fields.id&&((normalized(fields.phone)&&normalized(c.phone)===normalized(fields.phone))||(normalized(fields.email)&&normalized(c.email)===normalized(fields.email))||(normalized(fields.name)&&normalized(c.name)===normalized(fields.name))));
}
export function sameCandidateContact(candidate,fields){
 return Boolean((normalized(fields.phone)&&normalized(candidate.phone)===normalized(fields.phone))||(normalized(fields.email)&&normalized(candidate.email)===normalized(fields.email)));
}
export function applicationFromCandidate(data,{candidateId,templateId,resumeId,reviewer},actor){
 const candidate=data.candidates.find(c=>c.id===candidateId);if(!candidate)throw Error('请从简历库选择候选人');
 if(!canCreateApplication(data.applications,candidateId))throw Error('该候选人已有进行中的应聘，请查看当前应聘详情');
 candidateDetails(candidate,true);
 const template=data.templates.find(t=>t.id===templateId);if(!template)throw Error('请选择招聘流程');
 const resume=candidateResumes(candidate,data.applications).find(r=>r.id===resumeId);if(!resume)throw Error('请选择该候选人的已有简历，缺少附件时请先更新简历');
 if(reviewer&&!data.users.some(u=>u.role==='interviewer'&&!u.frozen&&u.name===reviewer))throw Error('请选择简历确认人');
 return {id:uid(),candidateId,templateId:template.id,job:template.name,jd:template.jd||'',status:'进行中',rounds:roundsFromTemplate(template),resume:structuredClone(resume),screening:reviewer?{status:'pending',interviewer:reviewer,reason:''}:{status:'skipped',interviewer:'',reason:''},history:[{at:new Date().toISOString(),actor,action:'创建应聘记录'}]};
}
