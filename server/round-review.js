import {readState,users,visibleState} from './database.js';
import {canReviewRound} from '../src/round-review.js';
import {endApplication} from '../src/model.js';
export function decideRoundReview(app,round,user,decision,reason='',now=new Date().toISOString()){
 if(user.role!=='interviewer'||!round||round.review?.status!=='pending'||!canReviewRound(app,round,user.name))throw Object.assign(Error('该轮简历不在你的待审核列表中，请刷新后重试'),{status:403});
 if(!['accepted','declined'].includes(decision))throw Error('请选择确认通过或不通过');
 if(typeof reason!=='string'||reason.length>2000||decision==='declined'&&!reason.trim())throw Error('不通过时请填写原因（不超过 2000 字）');
 round.review={...round.review,status:decision,reason:decision==='declined'?reason.trim():'',reviewedAt:now,reviewedBy:user.name};
 if(decision==='declined')Object.assign(app,endApplication(app,'未录用',`${round.name}简历审核不通过：${reason.trim()}`));
 app.history.unshift({at:now,actor:user.name,action:`${round.name}简历审核${decision==='accepted'?'通过':`不通过：${reason.trim()}`}`});
}
export async function saveRoundReview(pool,user,appId,roundId,body){
 const conn=await pool.getConnection();try{
  await conn.beginTransaction();const {state,revision}=await readState(conn,true);
  if(body.revision!==revision)throw Object.assign(Error('数据已更新，请刷新后重新确认'),{status:409});
  const people=await users(conn),actor=people.find(p=>p.id===user.id);
  if(!actor||actor.frozen||actor.role!=='interviewer')throw Object.assign(Error('面试官权限已变化'),{status:403});
  const app=state.applications.find(a=>a.id===appId),round=app?.rounds.find(r=>r.id===roundId);
  if(!app||!round)throw Object.assign(Error('无权审核此简历'),{status:403});
  decideRoundReview(app,round,actor,body.decision,body.reason||'');
  await conn.execute('UPDATE recruitment_state SET revision=revision+1,payload=? WHERE id=1',[JSON.stringify(state)]);
  await conn.execute('INSERT INTO recruitment_audit(actor_id,action,target_id) VALUES(?,?,?)',[actor.id,'确认下一轮简历',round.id]);await conn.commit();return visibleState(state,actor,people,revision+1);
 }catch(e){await conn.rollback();throw e;}finally{conn.release();}
}
