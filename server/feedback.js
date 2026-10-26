import {activateRoundReviews} from '../src/round-review.js';
import {applicationCreatorName} from '../src/permissions.js';
import {readState,visibleState,users} from './database.js';
import {text} from './validation.js';
import {transcriptReference} from './transcripts.js';
import {submitFeedback,terminateFailedApplication} from '../src/model.js';

export async function saveInterviewFeedback(pool,user,appId,roundId,body){
 const conn=await pool.getConnection();try{
  await conn.beginTransaction();const {state,revision}=await readState(conn,true);
  if(body.revision!==revision){throw Object.assign(Error('数据已更新，请刷新后重新填写'),{status:409});}
  const a=state.applications.find(a=>a.id===appId),r=a?.rounds.find(r=>r.id===roundId);
  if(!r||r.interviewer!==user.name||user.role!=='interviewer'||!r.time||r.cancelled){throw Object.assign(Error('无权修改此面评'),{status:403});}
  if(r.feedback.status==='submitted')throw Error('面评已提交，请先由 HR 退回');
  const input=body.feedback||{},f={summary:text(input.summary,'综合评价',10000),strengths:text(input.strengths,'优势',5000),concerns:text(input.concerns,'待验证事项',5000),conclusion:text(input.conclusion,'建议结论',20)};
  const transcript=await transcriptReference(conn,input.transcript,r.feedback.transcript,a.id,r.id,user);if(transcript)f.transcript=transcript;
  if(body.draft)r.feedback={...f,status:r.feedback.status==='returned'?'returned':'draft',author:user.name,returnReason:r.feedback.returnReason||''};
  else r.feedback=submitFeedback(a,r,user.name,f,body.completed===true);
  if(!body.draft){terminateFailedApplication(a,user.name);activateRoundReviews(a,applicationCreatorName(a,await users(conn)));}
  a.history.unshift({at:new Date().toISOString(),actor:user.name,action:body.draft?'保存面评草稿':'提交面评'});
  await conn.execute('UPDATE recruitment_state SET revision=revision+1,payload=? WHERE id=1',[JSON.stringify(state)]);await conn.execute('INSERT INTO recruitment_audit(actor_id,action,target_id) VALUES(?,?,?)',[user.id,body.draft?'保存面评草稿':'提交面评',r.id]);await conn.commit();return visibleState(state,user,await users(pool),revision+1);
 }catch(error){await conn.rollback();throw error;}finally{conn.release();}
}
