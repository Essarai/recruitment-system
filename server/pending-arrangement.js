import {validateSchedule} from '../src/model.js';
import {validateAvailabilityBookings} from './availability.js';
export async function activatePendingArrangement(conn,state,app,round,people){
 const draft=round?.pendingArrangement;if(!draft||draft.status!=='pending')return;
 const review=app.rounds[0]===round?app.screening:round.review;
 if(app.status!=='进行中'||round.cancelled||review?.status!=='accepted'||review.interviewer!==draft.interviewer||review.sentAt!==draft.reviewEpoch)return;
 const before=structuredClone(state),old=structuredClone(round);
 try{
  validateSchedule(app,round,draft,people.filter(p=>p.role==='interviewer'&&!p.frozen).map(p=>p.name));
  Object.assign(round,{time:draft.time,location:draft.location,mode:draft.mode,duration:draft.duration,calendarSource:draft.calendarSource,focus:draft.focus});
  await validateAvailabilityBookings(conn,before,state,people);
 }catch(error){
  Object.keys(round).forEach(key=>delete round[key]);Object.assign(round,old);
  if(error.code)throw error;
  round.pendingArrangement={...draft,status:'conflict',error:error.message};
  app.history.unshift({at:new Date().toISOString(),actor:'系统',action:`${round.name}审核通过，待确认安排未生效：${error.message}；请 HR 重新安排`});return;
 }
 delete round.pendingArrangement;
 round.scheduleEvents=[...(round.scheduleEvents||[]),{type:'created',at:new Date().toISOString(),actorName:'系统（审核后生效）'}];
 app.history.unshift({at:new Date().toISOString(),actor:'系统',action:`${round.name}新面试官审核通过，待确认安排已生效`});
}
