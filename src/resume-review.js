export function resumeReviewDecision(review,person,decision,reason='',now=new Date().toISOString()){
 if(!['accepted','declined','needs_info'].includes(decision))throw Error('请选择确认通过、不通过或需 HR 补充');
 if(typeof reason!=='string'||reason.length>2000||decision!=='accepted'&&!reason.trim())throw Error(decision==='needs_info'?'请填写需 HR 补充的原因（不超过 2000 字）':'不通过时请填写原因（不超过 2000 字）');
 const next={...review,status:decision,reason:decision==='accepted'?'':reason.trim(),reviewedAt:now,reviewedBy:person};
 if(decision==='needs_info')next.supplements=[...(review.supplements||[]),{reason:reason.trim(),requestedAt:now,requestedBy:person}];
 return next;
}
export function canReadInitialReview(app,person){
 return !app.withdrawnAt&&app.screening?.interviewer===person&&(app.status==='进行中'&&app.screening.status==='pending'||['accepted','declined','needs_info'].includes(app.screening.status));
}
