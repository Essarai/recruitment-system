import {profileFields} from './model.js';
import {isRecruiter} from './permissions.js';
let currentUser=null;
let baseline=null;
let currentDirectoryVersion=null;
const transcriptUploads=new WeakMap();
const resumeUploads=new WeakMap();
export async function request(path,options={}){
 const response=await fetch('/api'+path,{credentials:'same-origin',...options,headers:{...(typeof options.body==='string'?{'Content-Type':'application/json'}:{}),...options.headers}});
 if(!response.ok){let result;try{result=await response.json();}catch{result={error:'服务暂时不可用，请稍后重试'};}const error=Error(result.error||'请求失败');error.status=response.status;throw error;}
 return response.json();
}
export function acceptUpdate(result){if(currentUser&&result.user.id!==currentUser.id||baseline&&result.data.revision<baseline.revision)return false;currentUser=result.user;baseline=structuredClone(result.data);currentDirectoryVersion=result.directoryVersion;return true;}
const statePath=()=>'/state?compact=1'+(baseline?.partialCandidates?'&candidateIds='+encodeURIComponent(baseline.candidates.filter(c=>!c._summary).map(c=>c.id).slice(-20).join(',')):'');
export async function readUpdates({force=false,signal}={}){if(!force){const version=await request('/state/version',{signal});if(version.userId&&version.userId!==currentUser?.id)throw Object.assign(Error('登录账号已变化，请重新登录'),{status:401});if(version.revision===baseline?.revision&&version.directoryVersion===currentDirectoryVersion)return null;}return request(statePath(),{signal});}
export async function load(){const result=await request('/state?compact=1');currentUser=result.user;baseline=structuredClone(result.data);currentDirectoryVersion=result.directoryVersion;if(globalThis.indexedDB){try{indexedDB.deleteDatabase('light-recruitment-v1');}catch{/* Old demo storage is no longer used. */}}return result;}
export const login=(username,password)=>request('/login',{method:'POST',body:JSON.stringify({username,password})});
export const logout=()=>request('/logout',{method:'POST'});
export const createUser=user=>request('/users',{method:'POST',body:JSON.stringify(user)});
export const changePassword=password=>request('/password',{method:'POST',body:JSON.stringify(password)});
export function stateChanges(before,after){
 return Object.fromEntries(['candidates','applications','templates'].map(key=>{
  const old=new Map((before[key]||[]).map(record=>[record.id,record])),next=new Map((after[key]||[]).map(record=>[record.id,record]));
  return [key,[...new Set([...old.keys(),...next.keys()])].flatMap(id=>JSON.stringify(old.get(id))===JSON.stringify(next.get(id))?[]:[{id,before:old.get(id)??null,after:next.get(id)??null}])];
 }));
}
export async function save(next,onProgress=()=>{},feedbackTarget=null,candidateTarget=null){
 let result;
 if(candidateTarget&&isRecruiter(currentUser)){
  const candidate=next.candidates.find(c=>c.id===candidateTarget.id),originalCandidate=baseline.candidates.find(c=>c.id===candidateTarget.id);if(!candidate)throw Error('候选人不存在，请重新打开档案');
  const body={mode:candidateTarget.mode,candidate:{...candidate},...(candidateTarget.mode==='profile'?{originalCandidate:originalCandidate&&!originalCandidate._summary?Object.fromEntries(['id','name','phone','email',...profileFields.map(([key])=>key),'notes'].map(key=>[key,originalCandidate[key]??''])):null}:{}),loadedCandidateIds:next.candidates.filter(c=>!c._summary).map(c=>c.id).slice(-19)};
  if(candidateTarget.mode!=='profile'){
   const pending=candidate.resumes?.filter(r=>r.file instanceof File)||[];if(pending.length!==1)throw Error('请选择一份简历文件');
   const file=pending[0].file;onProgress('正在上传简历…');
   if(!resumeUploads.has(file))resumeUploads.set(file,request('/resumes?name='+encodeURIComponent(file.name),{method:'POST',headers:{'Content-Type':'application/octet-stream'},body:file}).catch(e=>{resumeUploads.delete(file);throw e;}));
   body.candidate.resumes=[await resumeUploads.get(file)];
  }else delete body.candidate.resumes;
  onProgress('正在保存候选人档案…');result=await request('/candidates/save',{method:'POST',body:JSON.stringify(body)});
 }else if(isRecruiter(currentUser)){
  const payload={...next,...(next.partialCandidates?{loadedCandidateIds:next.candidates.filter(c=>!c._summary).map(c=>c.id).slice(-20)}:{}),candidates:next.candidates.map(c=>({...c,...(c.resumes?{resumes:c.resumes.map(r=>({...r}))}:{})})),applications:next.applications.map(app=>({...app}))};
  for(const candidate of payload.candidates)for(let i=0;i<(candidate.resumes||[]).length;i++){const version=candidate.resumes[i];if(version.file instanceof File){onProgress('正在上传简历…');candidate.resumes[i]=await request('/resumes?name='+encodeURIComponent(version.file.name),{method:'POST',headers:{'Content-Type':'application/octet-stream'},body:version.file});}}
  for(const app of payload.applications){if(app.resume?.file instanceof File){const file=app.resume.file;onProgress('正在上传简历…');app.resume=await request('/resumes?name='+encodeURIComponent(file.name),{method:'POST',headers:{'Content-Type':'application/octet-stream'},body:file});}}
  onProgress('正在保存记录…');
  result=await request('/state',{method:'POST',body:JSON.stringify({revision:baseline.revision,changes:stateChanges(baseline,payload),partialCandidates:payload.partialCandidates===true,loadedCandidateIds:payload.loadedCandidateIds||[]})});
 }else{
  const changed=[];
  if(feedbackTarget){const app=next.applications.find(a=>a.id===feedbackTarget.appId),round=app?.rounds.find(r=>r.id===feedbackTarget.roundId);if(!round)throw Error('面评记录不存在，请刷新后重试');changed.push({app,round});}
  else
  for(const app of next.applications)for(const round of app.rounds){const old=baseline.applications.find(a=>a.id===app.id)?.rounds.find(r=>r.id===round.id);if(old&&JSON.stringify(old.feedback)!==JSON.stringify(round.feedback))changed.push({app,round});}
  if(changed.length!==1)throw Error('每次只能保存本人的一份面评');
  const {app,round}=changed[0],feedback={...round.feedback};
  if(feedback.transcript?.file instanceof File){
   const file=feedback.transcript.file;onProgress('正在上传面试对话…');
   if(!transcriptUploads.has(file))transcriptUploads.set(file,request(`/applications/${encodeURIComponent(app.id)}/rounds/${encodeURIComponent(round.id)}/transcript?name=${encodeURIComponent(file.name)}`,{method:'POST',headers:{'Content-Type':'application/octet-stream'},body:file}).catch(error=>{transcriptUploads.delete(file);throw error;}));
   feedback.transcript=await transcriptUploads.get(file);
  }
  onProgress('正在保存面评…');
  result=await request(`/applications/${encodeURIComponent(app.id)}/rounds/${encodeURIComponent(round.id)}/feedback`,{method:'PATCH',body:JSON.stringify({revision:baseline.revision,feedback,draft:round.feedback.status!=='submitted',completed:round.feedback.status==='submitted'})});
 }
 baseline=structuredClone(result);return result;
}
export const resumePath=id=>'/api/resumes/'+encodeURIComponent(id);

export async function decideScreening(appId,decision,reason){
 const result=await request(`/applications/${encodeURIComponent(appId)}/screening`,{method:'PATCH',body:JSON.stringify({revision:baseline.revision,decision,reason})});
 baseline=structuredClone(result);return result;
}

export const parseResume=(file,signal)=>request('/resumes/parse?name='+encodeURIComponent(file.name),{method:'POST',headers:{'Content-Type':'application/octet-stream'},body:file,signal:AbortSignal.any([signal,AbortSignal.timeout(30000)])});

export const setAccountFrozen=(id,frozen)=>request('/users/'+encodeURIComponent(id)+'/status',{method:'PATCH',body:JSON.stringify({frozen})});

export const resetAccountPassword=(id,password)=>request('/users/'+encodeURIComponent(id)+'/password',{method:'POST',body:JSON.stringify({password})});

export async function loadCandidate(id){
 const result=await request('/candidates/'+encodeURIComponent(id));
 if(!baseline||result.revision!==baseline.revision)throw Object.assign(Error('数据已更新，请刷新页面后重试'),{status:409});
 const candidates=baseline.candidates.filter(c=>c.id!==id);candidates.push(result.candidate);baseline={...baseline,candidates};return structuredClone(baseline);
}

export const setAccountRole=(id,role)=>request('/users/'+encodeURIComponent(id)+'/role',{method:'PATCH',body:JSON.stringify({role})});

export async function withdrawApplication(id){
 const result=await request('/applications/'+encodeURIComponent(id)+'/withdraw',{method:'POST',body:JSON.stringify({revision:baseline.revision,candidateIds:baseline.candidates.filter(c=>!c._summary).map(c=>c.id).slice(-20)})});
 baseline=structuredClone(result);return result;
}

export async function decideRoundReview(appId,roundId,decision,reason=''){
 const result=await request(`/applications/${encodeURIComponent(appId)}/rounds/${encodeURIComponent(roundId)}/review`,{method:'PATCH',body:JSON.stringify({revision:baseline.revision,decision,reason})});baseline=structuredClone(result);return result;
}

export async function endReviewedApplication(appId,roundId,reason){
 const result=await request(`/applications/${encodeURIComponent(appId)}/end-by-review`,{method:'POST',body:JSON.stringify({revision:baseline.revision,roundId,reason})});baseline=structuredClone(result);return result;
}

export async function progressInterview(appId,body){
 const result=await request(`/applications/${encodeURIComponent(appId)}/progression`,{method:'POST',body:JSON.stringify({...body,revision:baseline.revision})});baseline=structuredClone(result);return result;
}
