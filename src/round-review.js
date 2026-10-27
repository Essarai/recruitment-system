// Later-round review is separate from initial resume screening and interview feedback.
function progressionValid(source,target){
 const decision=source.hrProgression;
 return !!decision?.id&&['next','additional'].includes(decision.action)&&['待定','建议加面'].includes(source.feedback.conclusion)&&decision.conclusion===source.feedback.conclusion&&decision.sourceSubmittedAt===(source.feedback.submittedAt||'')&&decision.targetRoundId===target?.id;
}
export function pendingHRDecision(app){
 if(!app||app.status!=='进行中'||app.withdrawnAt)return null;
 const unfinished=app.rounds.findIndex(r=>r.feedback.status!=='submitted'),index=unfinished<0?app.rounds.length-1:unfinished-1;
 const source=app.rounds[index],next=app.rounds[index+1];
 if(!source||source.cancelled||source.feedback.status!=='submitted'||!['待定','建议加面'].includes(source.feedback.conclusion))return null;
 // Historical rounds already scheduled must remain usable without a retroactive decision.
 if(next&&(next.time||next.cancelled||next.feedback.status!=='none'||progressionValid(source,next)))return null;
 return {source,next};
}
export function activateRoundReviews(app,sentBy='',now=new Date().toISOString()){
 if(app.status!=='进行中'||app.withdrawnAt)return false;
 let changed=false;
 for(let i=1;i<app.rounds.length;i++){
  const previous=app.rounds[i-1],next=app.rounds[i];
  if(previous.feedback.status!=='submitted'||(previous.feedback.conclusion!=='建议通过'&&!progressionValid(previous,next))||next.time||next.cancelled||next.feedback.status!=='none')continue;
  const progressionId=previous.feedback.conclusion==='建议通过'?undefined:previous.hrProgression.id;
  if(next.review?.sourceRoundId===previous.id&&next.review.sourceSubmittedAt===(previous.feedback.submittedAt||'')&&next.review.sourceProgressionId===progressionId)continue;
  next.review={status:'pending',interviewer:next.interviewer||'',sentBy,sentAt:now,sourceRoundId:previous.id,sourceSubmittedAt:previous.feedback.submittedAt||'',...(progressionId?{sourceProgressionId:progressionId}:{}),reason:''};changed=true;
 }
 return changed;
}
export function reviewSourceValid(app,round){
 const previous=app.rounds[app.rounds.findIndex(r=>r.id===round.id)-1];
 return !!previous&&previous.id===round.review?.sourceRoundId&&previous.feedback.status==='submitted'&&(previous.feedback.submittedAt||'')===round.review.sourceSubmittedAt&&(previous.feedback.conclusion==='建议通过'?!round.review.sourceProgressionId:progressionValid(previous,round)&&round.review.sourceProgressionId===previous.hrProgression.id);
}
export function canReviewRound(app,round,person){return app.status==='进行中'&&!app.withdrawnAt&&!round.cancelled&&round.review?.interviewer===person&&['pending','accepted'].includes(round.review.status)&&reviewSourceValid(app,round);}
