// Later-round review is separate from initial resume screening and interview feedback.
export function activateRoundReviews(app,sentBy='',now=new Date().toISOString()){
 if(app.status!=='进行中'||app.withdrawnAt)return false;
 let changed=false;
 for(let i=1;i<app.rounds.length;i++){
  const previous=app.rounds[i-1],next=app.rounds[i];
  if(previous.feedback.status!=='submitted'||previous.feedback.conclusion!=='建议通过'||next.time||next.cancelled||next.feedback.status!=='none')continue;
  if(next.review?.sourceRoundId===previous.id&&next.review.sourceSubmittedAt===(previous.feedback.submittedAt||''))continue;
  next.review={status:'pending',interviewer:next.interviewer||'',sentBy,sentAt:now,sourceRoundId:previous.id,sourceSubmittedAt:previous.feedback.submittedAt||'',reason:''};changed=true;
 }
 return changed;
}
export function reviewSourceValid(app,round){
 const previous=app.rounds[app.rounds.findIndex(r=>r.id===round.id)-1];
 return !!previous&&previous.id===round.review?.sourceRoundId&&previous.feedback.status==='submitted'&&previous.feedback.conclusion==='建议通过'&&(previous.feedback.submittedAt||'')===round.review.sourceSubmittedAt;
}
export function canReviewRound(app,round,person){return app.status==='进行中'&&!app.withdrawnAt&&!round.cancelled&&round.review?.interviewer===person&&['pending','accepted'].includes(round.review.status)&&reviewSourceValid(app,round);}
