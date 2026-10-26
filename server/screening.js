import {canReviewRound} from '../src/round-review.js';
import {isRecruiter} from '../src/permissions.js';
import {isDeepStrictEqual as equal} from 'node:util';
import {reviewResume} from '../src/model.js';

export function normalizeScreening(previous,input,interviewers,actor){
 const old=previous?.screening,value=input.screening;
 if(old&&equal(old,value))return structuredClone(old);
 // Legacy records gain screening data only when HR explicitly pushes a resume.
 if(!old&&!value&&previous)return undefined;
 if(!previous&&value?.status==='skipped'&&value.interviewer==='')return {status:'skipped',interviewer:'',reason:''};
 if(!old&&!value)return {status:'unassigned',interviewer:'',reason:''};
 if(!old&&value?.status==='unassigned'&&!value.interviewer)return {status:'unassigned',interviewer:'',reason:''};
 if(previous?.status&&previous.status!=='进行中')throw Error('应聘已结束，不能推送简历');
 if(previous?.rounds.some(r=>r.time))throw Error('已有面试安排，不能重新发起简历确认');
 if(value?.status!=='pending'||!interviewers.includes(value.interviewer))throw Error('请选择有效的简历确认人；HR 不能代为接受简历');
 return {status:'pending',interviewer:value.interviewer,reason:'',sentAt:new Date().toISOString(),sentBy:actor};
}
export function decideScreening(app,user,decision,reason){
 if(user.role!=='interviewer')throw Error('仅被指定的简历确认人可以确认简历');
 return reviewResume(app,user.name,decision,reason);
}
export function canReviewResume(app,user){
 return user.role==='interviewer'&&app.status==='进行中'&&app.screening?.interviewer===user.name&&['pending','accepted'].includes(app.screening.status);
}
export function canAccessResume(app,user){
 return isRecruiter(user)||canReviewResume(app,user)||app.rounds.some(r=>canReviewRound(app,r,user.name))||app.rounds.some(r=>r.time&&r.interviewer===user.name);
}
