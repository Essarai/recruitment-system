import {applicationStage} from './model.js';
import {hasInterviewArrangement,isSpecialInterview} from './interview-arrangement.js';
export const applicationPhaseOptions=[['review','简历待确认'],['supplement','需 HR 补充'],['schedule','待安排面试'],['interview','待面试'],['feedback','待提交面评'],['decision','待 HR 决策']];
export function applicationPhase(app,now=Date.now()){
 if(app.status!=='进行中'||app.withdrawnAt)return '';
 const stage=applicationStage(app,now),r=stage.round;
 if(stage.awaitingHR||stage.name==='待 HR 决策')return 'decision';
 if(stage.name.includes('需 HR 补充'))return 'supplement';
 if(!r)return app.screening?.status==='pending'?'review':'schedule';
 if(r.review?.status==='pending')return r.review.interviewer?'review':'schedule';
 if(r.cancelled||!hasInterviewArrangement(r))return 'schedule';
 return ['draft','returned'].includes(r.feedback.status)||isSpecialInterview(r)||new Date(r.time).getTime()<=now?'feedback':'interview';
}
