import {isRecruiter} from './permissions.js';
let currentUser=null;
let baseline=null;
const transcriptUploads=new WeakMap();
export async function request(path,options={}){
 const response=await fetch('/api'+path,{credentials:'same-origin',...options,headers:{...(typeof options.body==='string'?{'Content-Type':'application/json'}:{}),...options.headers}});
 if(!response.ok){let result;try{result=await response.json();}catch{result={error:'服务暂时不可用，请稍后重试'};}const error=Error(result.error||'请求失败');error.status=response.status;throw error;}
 return response.json();
}
export async function load(){const result=await request('/state');currentUser=result.user;baseline=structuredClone(result.data);if(globalThis.indexedDB){try{indexedDB.deleteDatabase('light-recruitment-v1');}catch{/* Old demo storage is no longer used. */}}return result;}
export const login=(username,password)=>request('/login',{method:'POST',body:JSON.stringify({username,password})});
export const logout=()=>request('/logout',{method:'POST'});
export const createUser=user=>request('/users',{method:'POST',body:JSON.stringify(user)});
export const changePassword=password=>request('/password',{method:'POST',body:JSON.stringify(password)});
export async function save(next,onProgress=()=>{}){
 let result;
 if(isRecruiter(currentUser)){
  const payload={...next,candidates:next.candidates.map(c=>({...c,...(c.resumes?{resumes:c.resumes.map(r=>({...r}))}:{})})),applications:next.applications.map(app=>({...app}))};
  for(const candidate of payload.candidates)for(let i=0;i<(candidate.resumes||[]).length;i++){const version=candidate.resumes[i];if(version.file instanceof File){onProgress('正在上传简历…');candidate.resumes[i]=await request('/resumes?name='+encodeURIComponent(version.file.name),{method:'POST',headers:{'Content-Type':'application/octet-stream'},body:version.file});}}
  for(const app of payload.applications){if(app.resume?.file instanceof File){const file=app.resume.file;onProgress('正在上传简历…');app.resume=await request('/resumes?name='+encodeURIComponent(file.name),{method:'POST',headers:{'Content-Type':'application/octet-stream'},body:file});}}
  onProgress('正在保存记录…');
  result=await request('/state',{method:'POST',body:JSON.stringify(payload)});
 }else{
  const changed=[];
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
