import {appointmentTime} from '../src/availability.js';
import {hash} from './feishu-client.js';
export const arrangementNoticeStartedAt=Date.parse('2026-11-08T01:58:33Z');
export function arrangementNotice(a,r,person,name,now){
 const eventAt=r.scheduleEvents?.at(-1)?.at;
 if(!eventAt||Date.parse(eventAt)<arrangementNoticeStartedAt||Date.parse(eventAt)>now||!r.time||r.mode==='特殊'||r.feedback.status==='submitted')return null;
 const end=appointmentTime(r.time)+(r.duration||60)*60000;
 if(!Number.isFinite(end)||end<=now)return null;
 return {id:`notice:${a.id}:${r.id}`,kind:'notice',appId:a.id,roundId:r.id,active:a.status==='进行中'&&!a.withdrawnAt&&!r.cancelled,userId:person?.userId||'',openId:person?.openId||'',name,job:a.job,roundName:r.name,title:`面试安排通知｜${name}｜${a.job}｜${r.name}`,time:r.time,end,duration:r.duration||60,mode:r.mode,location:r.location,calendarSource:r.calendarSource||'system',eventAt};
}
function card(t,origin,expired=false){return {header:{template:expired?'grey':'blue',title:{tag:'plain_text',content:expired?'原面试安排已失效':t.title}},elements:[{tag:'div',text:{tag:'plain_text',content:expired?'原安排已取消或变更，请以系统当前安排为准。':`${t.time.replace('T',' ')}（北京时间） · ${t.duration} 分钟\n${t.mode}面试 · ${t.location}\n${t.calendarSource==='system'?'飞书日程由系统另行创建／更新。':'系统不创建飞书日程；本消息为正式面试安排通知。'}`}},{tag:'action',actions:[{tag:'button',text:{tag:'plain_text',content:'查看简历与面试安排'},type:'primary',url:origin+'/?application='+encodeURIComponent(t.appId)}]}]};}
export async function syncArrangementNotice(job,client,origin,checkpoint){
 const t=job.desired,r={...job.remote},signature=hash(t);
 if(r.noticeHash===signature)return r;
 if(r.messageId)await client.call('/im/v1/messages/'+encodeURIComponent(r.messageId),{method:'PATCH',body:{content:JSON.stringify(card(r.previous||t,origin,true))}});
 if(!t.active&&(!r.messageId||t.silent))return {...r,noticeHash:signature,closed:true};
 if(!t.openId)throw Error('面试官尚未绑定飞书，通知无法送达，请 HR 线下告知');
 const value=await client.call('/im/v1/messages?receive_id_type=open_id',{method:'POST',body:{receive_id:t.openId,msg_type:'interactive',uuid:hash({id:job.id,signature}).slice(0,32),content:JSON.stringify(card(t,origin,!t.active))}});
 if(!value.message_id)throw Error('飞书未返回安排通知 ID');
 const next={...r,messageId:value.message_id,noticeHash:signature,previous:t,closed:!t.active};await checkpoint(next);return next;
}
