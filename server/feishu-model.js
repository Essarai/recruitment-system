import {reviewSourceValid} from '../src/round-review.js';
import {hash} from './feishu-client.js';
import {appointmentTime} from '../src/availability.js';
export const parseJSON=value=>typeof value==='string'?JSON.parse(value):value;
export const emptyFeishuConfig=()=>({enabled:false,calendarId:'',allowAttendeeEdit:false,bindings:{},enabledAt:null,backfill:false,pilotUserId:''});
export function feishuDesired(state,users,config,now=Date.now()){
 const candidates=new Map(state.candidates.map(c=>[c.id,c])),people=new Map(users.filter(u=>u.role==='interviewer'&&!u.frozen).map(u=>[u.name,u])),items=[];
 const person=name=>{const u=people.get(name);return u?{userId:u.id,openId:config.bindings[u.id]||''}:null;};
 for(const a of state.applications){
  const name=candidates.get(a.candidateId)?.name||'候选人',eligible=at=>config.backfill||Date.parse(at)>=Date.parse(config.enabledAt);
  if(a.status==='进行中'&&a.screening?.status==='pending'&&eligible(a.screening.sentAt||a.history?.find(h=>h.action?.startsWith('创建应聘'))?.at)){
   const who=person(a.screening.interviewer);items.push({id:'review:'+a.id,kind:'review',appId:a.id,roundId:null,active:true,userId:who?.userId||'',openId:who?.openId||'',name,job:a.job,title:`待审核简历｜${name}｜${a.job}`,screeningAt:a.screening.sentAt||'',calendarId:config.calendarId});
  }
  for(const r of a.rounds){
   if(a.status==='进行中'&&!r.cancelled&&r.review?.status==='pending'&&reviewSourceValid(a,r)&&eligible(r.review.sentAt)){const who=person(r.review.interviewer);items.push({id:`round-review:${a.id}:${r.id}`,kind:'review',appId:a.id,roundId:r.id,reviewRoundName:r.name,active:true,userId:who?.userId||'',openId:who?.openId||'',name,job:a.job,title:`待审核简历｜${name}｜${a.job}｜${r.name}`,screeningAt:r.review.sentAt,calendarId:config.calendarId});}
   if(r.calendarSource==='external'||!r.time||r.feedback.status==='submitted')continue;
   const last=r.scheduleEvents?.at(-1)?.at||a.history?.find(h=>h.action?.startsWith('创建应聘'))?.at;
   if(!eligible(last))continue;
   const start=appointmentTime(r.time),end=start+(r.duration||60)*60000;
   const active=a.status==='进行中'&&!a.withdrawnAt&&!r.cancelled;
   if(active&&end<now)continue;
   const who=person(r.interviewer);
   items.push({id:`round:${a.id}:${r.id}`,kind:'round',appId:a.id,roundId:r.id,active,userId:who?.userId||'',openId:who?.openId||'',name,job:a.job,title:`面试｜${name}｜${a.job}｜${r.name}`,start,end,time:r.time,duration:r.duration||60,mode:r.mode,location:r.location,focus:r.focus||'',calendarId:config.calendarId,allowAttendeeEdit:!!config.allowAttendeeEdit});
  }
 }
 return config.pilotUserId?items.filter(item=>item.userId===config.pilotUserId):items;
}
export function reconcileFeishuJobs(state,existing,wanted,now=Date.now()){
 const map=new Map(wanted.map(t=>[t.id,t]));
 for(const old of existing)if(!map.has(old.id)){
  const a=state.applications.find(a=>a.id===old.application_id),round=a?.rounds.find(r=>r.id===old.round_id),external=old.kind==='round'&&round?.calendarSource==='external';
  // An explicit source switch retires only the event previously created by this system.
  if(!external&&old.kind==='round'&&(round?.feedback.status==='submitted'||old.desired.end<now&&a?.status==='进行中'&&!round?.cancelled))continue;
  map.set(old.id,{...old.desired,active:false,...(external?{calendarSource:'external'}:{})});
 }
 return [...map.values()];
}
export function remoteSchedule(event){
 const start=Number(event.start_time?.timestamp)*1000,end=Number(event.end_time?.timestamp)*1000,duration=(end-start)/60000;
 if(!Number.isFinite(start)||!Number.isFinite(end)||duration<15||duration>240||duration%15||typeof event.location?.name!=='string'||event.location.name.length>2000)return null;
 return {time:new Date(start+8*3600000).toISOString().slice(0,16),duration,location:event.location?.name||'',start,end,cancelled:event.status==='cancelled'};
}
export const scheduleSignature=value=>hash({start:value.start,end:value.end,location:value.location||'',cancelled:!!value.cancelled});
export function eventBody(task,origin){
 return {summary:task.title,description:`${task.focus?`考察重点：${task.focus}\n`:''}${task.mode==='线上'?`会议链接：${task.location}\n`:''}面试安排及面评请登录招聘系统：${origin}/?feishu=sync`,start_time:{timestamp:String(Math.floor(task.start/1000)),timezone:'Asia/Shanghai'},end_time:{timestamp:String(Math.floor(task.end/1000)),timezone:'Asia/Shanghai'},location:{name:task.location},visibility:'private',attendee_ability:task.allowAttendeeEdit?'can_modify_event':'can_see_others',need_notification:true};
}
export function reviewCard(task,origin,expired=false){
 return {config:{wide_screen_mode:true},header:{title:{tag:'plain_text',content:expired?'简历确认任务已更新':task.title},template:expired?'grey':'blue'},elements:[{tag:'div',text:{tag:'plain_text',content:expired?'该通知已失效，请以招聘系统中的最新任务为准。':task.reviewRoundName?`HR 已发起${task.reviewRoundName}简历审核，请确认是否通过；不通过将直接结束本次应聘。通过后由 HR 安排面试。`:'请查看简历和 HR 初步沟通结论后确认是否通过。简历确认与日程接受是两个独立操作。'}},...(!expired?[{tag:'action',actions:[{tag:'button',text:{tag:'plain_text',content:'查看并确认'},type:'primary',url:origin+'/?application='+encodeURIComponent(task.appId)}]}]:[])]};
}
