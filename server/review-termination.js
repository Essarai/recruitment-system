import {readState,users,visibleState} from './database.js';
import {endApplication} from '../src/model.js';
import {reviewTerminationTargets} from '../src/review-termination.js';
export function endReviewedApplication(app,user,roundId,reason){
 const target=app&&reviewTerminationTargets(app,user).find(t=>t.roundId===(roundId||null));
 if(!target)throw Object.assign(Error('无权结束此应聘，或本轮已提交面评、流程已结束'),{status:403});
 if(typeof reason!=='string'||!reason.trim()||reason.length>2000)throw Error('请填写结束原因（不超过 2000 字）');
 const detail=`${target.name}确认后结束流程：${reason.trim()}`;
 Object.assign(app,endApplication(app,'未录用',detail));
 app.history.unshift({at:new Date().toISOString(),actor:user.name,action:detail});
}
export async function saveReviewTermination(pool,user,appId,body){
 const conn=await pool.getConnection();try{
  await conn.beginTransaction();const {state,revision}=await readState(conn,true);
  if(body.revision!==revision)throw Object.assign(Error('数据已更新，请刷新后重新操作'),{status:409});
  const people=await users(conn),actor=people.find(p=>p.id===user.id);
  if(!actor||actor.frozen||actor.role!=='interviewer')throw Object.assign(Error('面试官权限已变化'),{status:403});
  const app=state.applications.find(a=>a.id===appId);endReviewedApplication(app,actor,body.roundId,body.reason);
  await conn.execute('UPDATE recruitment_state SET revision=revision+1,payload=? WHERE id=1',[JSON.stringify(state)]);
  await conn.execute('INSERT INTO recruitment_audit(actor_id,action,target_id) VALUES(?,?,?)',[actor.id,'简历确认后结束流程',appId]);await conn.commit();return visibleState(state,actor,people,revision+1);
 }catch(e){await conn.rollback();throw e;}finally{conn.release();}
}
