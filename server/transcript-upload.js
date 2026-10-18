import {readState} from './database.js';
import {text} from './validation.js';
import {validateTranscript,canUploadTranscript} from './transcripts.js';
import {storePrivateFile} from './files.js';
import {DeleteObjectCommand} from '@aws-sdk/client-s3';
export async function uploadInterviewTranscript({pool,s3,bucket},user,appId,roundId,filename,buffer){
 const {state}=await readState(pool),a=state.applications.find(a=>a.id===appId),r=a?.rounds.find(r=>r.id===roundId);
 if(!canUploadTranscript(a,r,user))throw Object.assign(Error('仅本轮面试官可以在未锁定的面评中上传对话'),{status:403});
 const name=text(filename,'文件名',240,true),format=validateTranscript(name,buffer);
 const file=await storePrivateFile(pool,s3,bucket,user.id,name,buffer,format,'transcripts');
 try{await pool.execute('INSERT INTO recruitment_transcripts(file_id,application_id,round_id) VALUES(?,?,?)',[file.id,a.id,r.id]);}
 catch(error){const [[stored]]=await pool.execute('SELECT object_key FROM recruitment_files WHERE id=?',[file.id]);try{await s3.send(new DeleteObjectCommand({Bucket:bucket,Key:stored.object_key}));await pool.execute('DELETE FROM recruitment_files WHERE id=?',[file.id]);}catch{console.error('Failed to clean an unlinked transcript',file.id);}throw error;}
 return file;
}
