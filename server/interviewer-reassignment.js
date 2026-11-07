import {hasInterviewArrangement} from '../src/interview-arrangement.js';
import {readState,users,visibleState} from './database.js';
import {canManageApplication} from '../src/permissions.js';
import {reviewSourceValid} from '../src/round-review.js';
import {text} from './validation.js';
import {compactCandidates} from './resume-library.js';

export function reassignInterviewer(app,round,actor,people,body,now=new Date().toISOString()){
 if(!app||!canManageApplication(actor,app)||actor.frozen)throw Object.assign(Error('仅发起 HR 或管理员可以更换面试官'),{status:403});
 const index=app.rounds.indexOf(round);
 if(index<0||app.status!=='进行中'||app.withdrawnAt)throw Error('当前应聘或轮次不可更换面试官');
 if(round.mode==='特殊'||round.feedback.status!=='none'||round.feedback.author||round.feedback.transcript||round.feedbackVersions?.length)throw Error('已有面评记录或已完成的特殊面试不能更换面试官，请增加一轮');
 if(round.review?.status==='needs_info'||index===0&&app.screening?.status==='needs_info')throw Error('请先补充说明并重新送审');
 if(app.rounds.slice(index+1).some(r=>hasInterviewArrangement(r)||r.feedback.status!=='none'))throw Error('后续轮次已有安排或面评，不能回退更换');
 if(index>0&&!reviewSourceValid(app,round))throw Error('本轮审核来源已失效，请先处理上一轮结果');
 const name=text(body.interviewer,'新面试官',100,true),reason=text(body.reason,'更换原因',2000,true);
 if(name===round.interviewer)throw Error('请选择不同的面试官');
 if(!people.some(p=>p.name===name&&p.role==='interviewer'&&!p.frozen))throw Error('请选择启用的新面试官');
 const old={interviewer:round.interviewer,time:round.time,location:round.location,mode:round.mode,review:round.review,screening:index===0?app.screening:undefined};
 round.scheduleEvents=[...(round.scheduleEvents||[]),{type:'reassigned',at:now,actorId:actor.id,actorName:actor.name,reason,previous:old}];
 Object.assign(round,{interviewer:name,time:'',location:'',cancelled:false});
 const epoch=new Date(Math.max(Date.parse(now),Date.parse((index===0?app.screening:round.review)?.sentAt||'')+1||0)).toISOString();
 const review={...(index===0?{}:round.review),status:'pending',interviewer:name,sentBy:actor.name,sentAt:epoch,reason:''};delete review.reviewedAt;delete review.reviewedBy;
 if(index===0)app.screening=review;else round.review=review;
 app.history.unshift({at:now,actor:actor.name,action:`${round.name}更换面试官：${old.interviewer||'未指定'} → ${name}；原排期已撤销，重新审核简历；原因：${reason}`});
}
export async function saveInterviewerReassignment(pool,user,appId,body){
 const conn=await pool.getConnection();try{
  await conn.beginTransaction();const {state,revision}=await readState(conn,true);
  if(body.revision!==revision)throw Object.assign(Error('数据已更新，更换尚未保存，请重新打开最新记录核对'),{status:409});
  const people=await users(conn),actor=people.find(p=>p.id===user.id),app=state.applications.find(a=>a.id===appId),round=body.roundId?app?.rounds.find(r=>r.id===body.roundId):null;
  if(!actor||actor.frozen||body.roundId&&!round)throw Object.assign(Error('账号权限或面试轮次已变化'),{status:403});
  reassignInterviewer(app,round,actor,people,body);
  await conn.execute('UPDATE recruitment_state SET revision=revision+1,payload=? WHERE id=1',[JSON.stringify(state)]);
  await conn.execute('INSERT INTO recruitment_audit(actor_id,action,target_id) VALUES(?,?,?)',[actor.id,'更换面试官并重新送审',round?.id||app.id]);
  await conn.commit();const ids=Array.isArray(body.candidateIds)?body.candidateIds.filter(id=>typeof id==='string'&&id!==app.candidateId).slice(-19):[];
  return visibleState(compactCandidates(state,[app.candidateId,...ids]),actor,people,revision+1);
 }catch(e){await conn.rollback();throw e;}finally{conn.release();}
}
