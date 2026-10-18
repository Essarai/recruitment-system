import {isRecruiter} from '../src/permissions.js';
import {validateResume,MAX_FILE} from './files.js';

export function validateTranscript(name,buffer){
 if(!/\.(txt|md)$/i.test(name))return validateResume(name,buffer);
 if(!name||name.length>240||/[\r\n/\\\0]/.test(name))throw Error('对话文件名无效');
 if(!Buffer.isBuffer(buffer)||!buffer.length||buffer.length>MAX_FILE)throw Error('对话文件须大于 0 且不超过 20 MB');
 let content;try{content=new TextDecoder('utf-8',{fatal:true}).decode(buffer);}catch{throw Error('TXT / Markdown 请使用 UTF-8 编码');}
 if(!content.trim()||/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(content))throw Error('请上传有效的文本对话文件');
 return {extension:name.toLowerCase().split('.').pop(),type:/\.md$/i.test(name)?'text/markdown; charset=utf-8':'text/plain; charset=utf-8'};
}
export function canUploadTranscript(app,round,user){
 return !!round&&user.role==='interviewer'&&round.interviewer===user.name&&!!round.time&&!round.cancelled&&round.feedback.status!=='submitted';
}
export function canReadTranscript(state,fileId,user){
 return state.applications.some(app=>app.rounds.some(round=>{
  const published=[...(round.feedback.status==='submitted'?[round.feedback]:[]),...(round.feedbackVersions||[])];
  if(isRecruiter(user))return published.some(f=>f.transcript?.id===fileId);
  return user.role==='interviewer'&&round.interviewer===user.name&&!!round.time&&[round.feedback,...published].some(f=>f.transcript?.id===fileId);
 }));
}
export async function transcriptReference(db,input,previous,appId,roundId,user){
 const value=input===undefined?previous:input;if(!value)return undefined;
 if(typeof value.id!=='string'||value.id.length>80)throw Error('对话附件无效，请重新上传');
 const [[file]]=await db.execute(`SELECT f.id,f.name,f.mime,f.size FROM recruitment_files f JOIN recruitment_transcripts t ON t.file_id=f.id
  WHERE f.id=? AND f.owner_id=? AND t.application_id=? AND t.round_id=?`,[value.id,user.id,appId,roundId]);
 if(!file)throw Error('对话附件不存在或不属于本轮面试');
 return {id:file.id,name:file.name,type:file.mime,size:file.size};
}
