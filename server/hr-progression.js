import {randomUUID} from 'node:crypto';
import {readState,users,visibleState} from './database.js';
import {canManageApplication,isRecruiter,applicationCreatorName} from '../src/permissions.js';
import {pendingHRDecision,activateRoundReviews} from '../src/round-review.js';
import {round} from '../src/model.js';

export function progressInterview(app,actor,people,body,now=new Date().toISOString()){
 if(!actor||actor.frozen||!isRecruiter(actor)||!app||!canManageApplication(actor,app))throw Object.assign(Error('仅发起 HR 或管理员可以决定后续安排'),{status:403});
 const pending=pendingHRDecision(app);
 if(!pending||pending.source.id!==body.sourceRoundId)throw Object.assign(Error('当前轮次已变化或已处理，请刷新后重试'),{status:409});
 const {source,next}=pending;
 if(!['next','additional'].includes(body.action))throw Error('请选择推进下一轮或追加面试');
 if(typeof body.reason!=='string'||!body.reason.trim()||body.reason.length>2000)throw Error('请填写推进说明（不超过 2000 字）');
 if(!people.some(p=>p.role==='interviewer'&&!p.frozen&&p.name===body.interviewer))throw Error('请选择启用的本轮审核面试官');
 if(body.action==='next'&&!next)throw Error('没有后续轮次，请选择追加面试');
 if(body.action==='additional'){
  if(app.rounds.length>=50)throw Error('面试轮次最多 50 轮');
  if(typeof body.name!=='string'||!body.name.trim()||body.name.length>100)throw Error('请填写加面名称（不超过 100 字）');
  if(app.rounds.some(r=>r.name===body.name.trim()))throw Error('面试轮次名称不能重复');
 }
 const target=body.action==='next'?next:round(body.name.trim());
 if(body.action==='additional')app.rounds.splice(app.rounds.indexOf(source)+1,0,target);
 target.interviewer=body.interviewer;
 source.hrProgression={id:randomUUID(),action:body.action,sourceSubmittedAt:source.feedback.submittedAt||'',conclusion:source.feedback.conclusion,targetRoundId:target.id,actorId:actor.id,actorName:actor.name,reason:body.reason.trim(),at:now};
 activateRoundReviews(app,applicationCreatorName(app,people),now);
 app.history.unshift({at:now,actor:actor.name,action:`${source.name}面评${source.feedback.conclusion}，HR ${body.action==='next'?'推进':'追加'}${target.name}，由 ${target.interviewer} 审核简历；说明：${body.reason.trim()}`});
 return target;
}

export async function saveHRProgression(pool,user,appId,body){
 const conn=await pool.getConnection();try{
  await conn.beginTransaction();const {state,revision}=await readState(conn,true);
  if(body.revision!==revision)throw Object.assign(Error('数据已更新，请刷新后重新处理'),{status:409});
  const people=await users(conn),actor=people.find(p=>p.id===user.id),app=state.applications.find(a=>a.id===appId);
  const target=progressInterview(app,actor,people,body);
  await conn.execute('UPDATE recruitment_state SET revision=revision+1,payload=? WHERE id=1',[JSON.stringify(state)]);
  await conn.execute('INSERT INTO recruitment_audit(actor_id,action,target_id) VALUES(?,?,?)',[actor.id,body.action==='next'?'HR 推进下一轮简历审核':'HR 追加面试并发起简历审核',target.id]);
  await conn.commit();return visibleState(state,actor,people,revision+1);
 }catch(e){await conn.rollback();throw e;}finally{conn.release();}
}
