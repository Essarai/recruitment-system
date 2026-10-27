import {reviewSourceValid} from './round-review.js';
// A reviewer may reconsider an accepted resume until that interview's feedback is submitted.
export function reviewTerminationTargets(app,user){
 if(user.role!=='interviewer'||app.status!=='进行中'||app.withdrawnAt)return [];
 const targets=[],first=app.rounds[0];
 if(app.screening?.status==='accepted'&&app.screening.interviewer===user.name&&first&&!first.cancelled&&first.feedback.status!=='submitted')targets.push({roundId:null,name:'首轮简历确认'});
 for(const r of app.rounds)if(r.review?.status==='accepted'&&r.review.interviewer===user.name&&r.interviewer===user.name&&!r.cancelled&&r.feedback.status!=='submitted'&&reviewSourceValid(app,r))targets.push({roundId:r.id,name:r.name});
 return targets;
}
