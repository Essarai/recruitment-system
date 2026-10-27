import {isDeepStrictEqual as equal} from 'node:util';
import {isRecruiter} from '../src/permissions.js';
import {profileFields} from '../src/model.js';
import {readState,users,visibleState} from './database.js';
import {compactCandidates} from './resume-library.js';
import {text,validateHRState} from './validation.js';
const fields=['name','phone','email',...profileFields.map(([key])=>key),'notes'];
const conflict=message=>Object.assign(Error(message),{status:409});
const profile=value=>Object.fromEntries(fields.map(key=>[key,String(value?.[key]??'').trim()]));

export function applyCandidateChange(state,body,actor,files){
 if(!actor||actor.frozen||!isRecruiter(actor))throw Object.assign(Error('仅启用的管理员或 HR 可以保存候选人'),{status:403});
 const id=text(body.candidate?.id,'候选人 ID',80,true),old=state.candidates.find(c=>c.id===id),mode=body.mode;
 if(!['create','profile','resume'].includes(mode))throw Error('请选择有效的档案保存操作');
 let candidate;
 if(mode==='create'){
  candidate={id,...profile(body.candidate),resumes:body.candidate.resumes};
  if(!Array.isArray(candidate.resumes)||candidate.resumes.length!==1)throw Error('请上传一份简历附件');
  if(old){if(equal(profile(old),profile(candidate))&&equal((old.resumes||[]).map(r=>r.id),candidate.resumes.map(r=>r.id)))return {id,changed:false};throw conflict('该候选人已保存，请核对最新档案后重试');}
 }else{
  if(!old)throw conflict('候选人档案已变化，请重新打开档案');
  candidate=structuredClone(old);
  if(mode==='resume'){
   if(!Array.isArray(body.candidate.resumes)||body.candidate.resumes.length!==1)throw Error('请上传一份新版简历');
   const attachment=body.candidate.resumes[0];if((old.resumes||[]).some(r=>r.id===attachment?.id))return {id,changed:false};
   candidate.resumes=[attachment,...(old.resumes||[])];
  }else{
   if(body.originalCandidate?.id!==id||body.originalCandidate._summary)throw Error('请先读取完整候选人资料');
   const original=profile(body.originalCandidate),edited=profile(body.candidate),current=profile(old);
   for(const key of fields)if(edited[key]!==original[key]){
    if(current[key]!==original[key]&&current[key]!==edited[key])throw conflict('该候选人的同一资料已被他人修改，本次内容尚未保存；请重新打开最新档案核对');
    candidate[key]=edited[key];
   }
  }
 }
 // Validate only the candidate patch, leaving canonical applications and templates untouched.
 const before={candidates:state.candidates,applications:[],templates:[]},next={...before,candidates:old?state.candidates.map(c=>c.id===id?candidate:c):[...state.candidates,candidate]};
 const saved=validateHRState(before,next,[],files,actor.name,[],actor).candidates;
 if(equal(saved,state.candidates))return {id,changed:false};state.candidates=saved;return {id,changed:true};
}

export async function saveCandidateChange(pool,user,body){
 const conn=await pool.getConnection();try{
  await conn.beginTransaction();const {state,revision}=await readState(conn,true),people=await users(conn),actor=people.find(p=>p.id===user.id);
  if(!actor||actor.frozen||!isRecruiter(actor))throw Object.assign(Error('账号权限已变化，请重新登录'),{status:403});
  const id=text(body.candidate?.id,'候选人 ID',80,true),old=state.candidates.find(c=>c.id===id),references=[...(old?.resumes||[]),...(Array.isArray(body.candidate?.resumes)?body.candidate.resumes:[])];
  if(references.length>501)throw Error('简历版本过多');
  const ids=[...new Set(references.map(r=>text(r?.id,'简历附件 ID',80,true)))];
  const [files]=ids.length?await conn.query(`SELECT id,name,mime,size FROM recruitment_files WHERE object_key LIKE 'resumes/%' AND id IN (${ids.map(()=>'?').join(',')})`,ids):[[]];
  const {changed}=applyCandidateChange(state,body,actor,files);
  if(changed){
   await conn.execute('UPDATE recruitment_state SET revision=revision+1,payload=? WHERE id=1',[JSON.stringify(state)]);
   await conn.execute('INSERT INTO recruitment_audit(actor_id,action,target_id) VALUES(?,?,?)',[actor.id,{create:'导入候选人简历',profile:'编辑候选人资料',resume:'更新候选人简历'}[body.mode],id]);
  }
  await conn.commit();const loaded=Array.isArray(body.loadedCandidateIds)?body.loadedCandidateIds.filter(x=>typeof x==='string').slice(-19):[];
  return visibleState(compactCandidates(state,[id,...loaded.filter(x=>x!==id)]),actor,people,revision+(changed?1:0));
 }catch(e){await conn.rollback();throw e;}finally{conn.release();}
}
