import {readState,users,visibleState} from './database.js';
import {canManageApplication} from '../src/permissions.js';
import {canReviewRound} from '../src/round-review.js';
import {text} from './validation.js';
import {compactCandidates} from './resume-library.js';

export function supplementReview(app,round,actor,people,response,now=new Date().toISOString(),reviewer=null){
 if(!app||!canManageApplication(actor,app)||actor.frozen)throw Object.assign(Error('仅发起 HR 或管理员可以补充并重新送审'),{status:403});
 const review=round?round.review:app.screening;
 if(app.status!=='进行中'||app.withdrawnAt||review?.status!=='needs_info'||(round?!canReviewRound(app,round,review.interviewer)||round.time:app.rounds.some(r=>r.time)))throw Object.assign(Error('当前简历已不在待补充状态，请刷新核对'),{status:409});
 const recipient=text(reviewer??review.interviewer,'简历确认人',100,true);
 if(!people.some(p=>p.name===recipient&&p.role==='interviewer'&&!p.frozen))throw Error('请选择启用的简历确认人');
 const reply=text(response,'补充说明',2000,true),request=review.supplements?.at(-1);
 if(!request||request.response)throw Object.assign(Error('补充要求已变化，请刷新核对'),{status:409});
 const next={...review,status:'pending',interviewer:recipient,reason:'',sentBy:actor.name,sentAt:now,supplements:[...review.supplements.slice(0,-1),{...request,response:reply,respondedAt:now,respondedBy:actor.name,assignedTo:recipient}]};
 delete next.reviewedAt;delete next.reviewedBy;
 if(round){round.review=next;round.interviewer=recipient;}else app.screening=next;
 app.history.unshift({at:now,actor:actor.name,action:`${round?round.name:'初始'}简历确认：补充说明后重新送审给 ${recipient}`});
}
export async function saveReviewSupplement(pool,user,appId,body){
 const conn=await pool.getConnection();try{
  await conn.beginTransaction();const {state,revision}=await readState(conn,true);
  if(body.revision!==revision)throw Object.assign(Error('数据已更新，补充内容尚未保存，请重新打开最新记录核对'),{status:409});
  const people=await users(conn),actor=people.find(p=>p.id===user.id),app=state.applications.find(a=>a.id===appId),round=body.roundId?app?.rounds.find(r=>r.id===body.roundId):null;
  if(!actor||actor.frozen||body.roundId&&!round)throw Object.assign(Error('账号权限或面试轮次已变化'),{status:403});
  supplementReview(app,round,actor,people,body.response,undefined,body.interviewer);
  await conn.execute('UPDATE recruitment_state SET revision=revision+1,payload=? WHERE id=1',[JSON.stringify(state)]);
  await conn.execute('INSERT INTO recruitment_audit(actor_id,action,target_id) VALUES(?,?,?)',[actor.id,'补充说明并重新送审简历',round?.id||app.id]);
  await conn.commit();const ids=Array.isArray(body.candidateIds)?body.candidateIds.filter(id=>typeof id==='string'&&id!==app.candidateId).slice(-19):[];
  return visibleState(compactCandidates(state,[app.candidateId,...ids]),actor,people,revision+1);
 }catch(e){await conn.rollback();throw e;}finally{conn.release();}
}
