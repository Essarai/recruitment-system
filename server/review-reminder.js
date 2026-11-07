import {hash} from './feishu-client.js';
import {reviewCard} from './feishu-model.js';
const offset=8*3600000;
export function reviewReminderDue(sentAt){
 const stamp=Date.parse(sentAt);if(!Number.isFinite(stamp))return null;
 const date=new Date(stamp+offset);let days=0;
 while(days<3){date.setUTCDate(date.getUTCDate()+1);if(date.getUTCDay()!==0&&date.getUTCDay()!==6)days++;}
 return date.getTime()-offset;
}
export async function remindResumeReview(job,client,origin,now=Date.now()){
 const t=job.desired,r={...job.remote},due=reviewReminderDue(t.screeningAt),day=new Date(now+offset).getUTCDay();
 if(t.kind!=='review'||!t.active||!t.openId||!r.messageId||due===null||now<due||day===0||day===6||r.reminderEpoch===t.screeningAt&&r.reminderOpenId===t.openId)return r;
 const card=reviewCard(t,origin);card.header.title.content=`简历审核提醒｜${t.name}｜${t.job}`;card.header.template='orange';card.elements[0].text.content=`这份简历自本次送审起已超过 3 个工作日未处理，请查看候选人简历并确认是否通过。${t.reviewRoundName?'本轮：'+t.reviewRoundName+'。':''}如需更多信息，可选择“需 HR 补充”。请以系统当前任务为准。`;
 const value=await client.call('/im/v1/messages?receive_id_type=open_id',{method:'POST',body:{receive_id:t.openId,msg_type:'interactive',uuid:hash({id:job.id,epoch:t.screeningAt,openId:t.openId,kind:'review-reminder'}).slice(0,32),content:JSON.stringify(card)}});
 if(!value.message_id)throw Error('飞书未返回提醒消息 ID');
 return {...r,reminderMessageId:value.message_id,reminderEpoch:t.screeningAt,reminderOpenId:t.openId,remindedAt:new Date(now).toISOString()};
}
