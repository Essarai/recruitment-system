import {isRecruiter} from '../src/permissions.js';
import {isDeepStrictEqual as equal} from 'node:util';
import {reviewResume} from '../src/model.js';

export function normalizeScreening(previous,input,interviewers,actor){
 const old=previous?.screening,value=input.screening;
 if(old&&equal(old,value))return structuredClone(old);
 // Legacy records gain screening data only when HR explicitly pushes a resume.
 if(!old&&!value&&previous)return undefined;
 if(!old&&!value)return {status:'unassigned',interviewer:'',reason:''};
 if(!old&&value?.status==='unassigned'&&!value.interviewer)return {status:'unassigned',interviewer:'',reason:''};
 if(previous?.status&&previous.status!=='进行中')throw Error('应聘已结束，不能推送简历');
 if(previous?.rounds[0]?.time)throw Error('首轮已安排，不能重新推送简历');
 if(value?.status!=='pending'||!interviewers.includes(value.interviewer))throw Error('请选择有效的首轮简历确认人；HR 不能代为接受简历');
 return {status:'pending',interviewer:value.interviewer,reason:'',sentAt:new Date().toISOString(),sentBy:actor};
}
export function decideScreening(app,user,decision,reason){
 if(user.role!=='interviewer')throw Error('仅被指定的业务面试官可以确认简历');
 return reviewResume(app,user.name,decision,reason);
}
export function canReviewResume(app,user){
 return user.role==='interviewer'&&app.status==='进行中'&&app.screening?.interviewer===user.name&&['pending','accepted'].includes(app.screening.status);
}
export function canAccessResume(app,user){
 return isRecruiter(user)||canReviewResume(app,user)||app.rounds.some(r=>r.time&&r.interviewer===user.name);
}
