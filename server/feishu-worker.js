import {randomUUID} from 'node:crypto';
import {createFeishuClient,feishuEnvironment,hash} from './feishu-client.js';
import {feishuDesired,scheduleSignature,remoteSchedule,eventBody,reviewCard} from './feishu-model.js';
import {readFeishuConfig,readJobs,jobRow} from './feishu-store.js';
import {readState,users} from './database.js';
const eventPath=remote=>'/calendar/v4/calendars/'+encodeURIComponent(remote.calendarId)+'/events/'+encodeURIComponent(remote.eventId);
export async function syncFeishuJob(job,client,origin,checkpoint){
 const t=job.desired,r={...job.remote};
 if(t.kind==='review'){
  if(r.messageId&&(!t.active||r.openId!==t.openId||r.reviewEpoch!==t.screeningAt)){
   await client.call('/im/v1/messages/'+encodeURIComponent(r.messageId),{method:'PATCH',body:{content:JSON.stringify(reviewCard(t,origin,true))}});r.messageId=null;await checkpoint(r);
  }
  if(!t.active)return {...r,closed:true};
  if(!t.openId)throw Error('确认人尚未绑定有效的飞书账号');
  if(!r.messageId){const value=await client.call('/im/v1/messages?receive_id_type=open_id',{method:'POST',body:{receive_id:t.openId,msg_type:'interactive',uuid:r.uuid,content:JSON.stringify(reviewCard(t,origin))}});if(!value.message_id)throw Error('飞书未返回通知 ID');r.messageId=value.message_id;r.openId=t.openId;r.reviewEpoch=t.screeningAt;await checkpoint(r);}
  return {...r,closed:false};
 }
 if(r.eventId&&(r.calendarId!==t.calendarId||r.openId!==t.openId)){
  await client.call(eventPath(r),{method:'DELETE'});r.eventId=null;r.attendeeId=null;r.proposal=null;r.createKey=randomUUID();await checkpoint(r);
 }
 if(!t.active){if(r.eventId&&!r.closed){await client.call(eventPath(r),{method:'DELETE'});r.closed=true;r.proposal=null;await checkpoint(r);}return r;}
 if(!t.openId)throw Error('面试官尚未绑定有效的飞书账号');
 if(!r.eventId||r.closed){
  const value=await client.call('/calendar/v4/calendars/'+encodeURIComponent(t.calendarId)+'/events?idempotency_key='+encodeURIComponent(r.createKey),{method:'POST',body:eventBody(t,origin)});
  if(!value.event?.event_id)throw Error('飞书未返回日程 ID');
  r.eventId=value.event.event_id;r.calendarId=t.calendarId;r.openId=t.openId;r.closed=false;r.attendeeId=null;r.proposal=null;r.schedule=scheduleSignature(t);await checkpoint(r);
 }else{
  await client.call(eventPath(r),{method:'PATCH',body:eventBody(t,origin)});r.schedule=scheduleSignature(t);r.proposal=null;await checkpoint(r);
 }
 const list=await client.call(eventPath(r)+'/attendees?user_id_type=open_id&page_size=100');
 let attendee=(list.items||[]).find(a=>a.user_id===t.openId);
 if(!attendee){const value=await client.call(eventPath(r)+'/attendees?user_id_type=open_id',{method:'POST',body:{attendees:[{type:'user',user_id:t.openId}],need_notification:true}});attendee=(value.attendees||[]).find(a=>a.user_id===t.openId);}
 r.attendeeId=attendee?.attendee_id||r.attendeeId;r.rsvp=attendee?.rsvp_status||'needs_action';await checkpoint(r);
 return r;
}
export async function observeFeishuJob(job,client){
 const r={...job.remote};if(!r.eventId||r.closed||!job.desired.active)return r;
 const result=await client.call(eventPath(r));const event=result.event;if(!event)throw Error('无法读取飞书日程');
 if(event.status==='cancelled')r.proposal={cancelled:true,baseHash:job.desired_hash,remoteHash:hash({eventId:r.eventId,cancelled:true}),observedAt:new Date().toISOString()};
 else{
  const next=remoteSchedule(event);
  if(next){const signature=scheduleSignature(next);if(signature!==r.schedule&&signature!==r.dismissedSchedule)r.proposal={...next,baseHash:job.desired_hash,remoteHash:signature,observedAt:new Date().toISOString()};else if(signature===r.schedule)r.proposal=null;}
 }
 const list=await client.call(eventPath(r)+'/attendees?user_id_type=open_id&page_size=100');
 const attendee=(list.items||[]).find(a=>a.user_id===job.desired.openId);r.rsvp=attendee?.rsvp_status||'missing';r.checkedAt=new Date().toISOString();return r;
}
export function startFeishuWorker(pool,{env=process.env,client=createFeishuClient({env})}={}){
 let running=false,stopped=false,lastTick=null,lastFinished=null,lastError='';
 async function tick(){
  if(running||stopped||!feishuEnvironment(env).ready)return;running=true;lastTick=new Date().toISOString();lastError='';let conn,locked=false;
  try{
   conn=await pool.getConnection();const [[lock]]=await conn.query("SELECT GET_LOCK('recruitment-feishu-worker',0) AS acquired");if(!lock.acquired)return;locked=true;
   await conn.beginTransaction();const {state,revision:stateRevision}=await readState(conn,true),userList=await users(conn),{config,revision:configRevision}=await readFeishuConfig(conn);
   if(!config.enabled){await conn.commit();return;}
   const existing=(await readJobs(conn)).filter(job=>!config.pilotUserId||job.desired.userId===config.pilotUserId),wanted=feishuDesired(state,userList,config),map=new Map(wanted.map(t=>[t.id,t]));
   for(const old of existing)if(!map.has(old.id)){
    const a=state.applications.find(a=>a.id===old.application_id),round=a?.rounds.find(r=>r.id===old.round_id);
    // Completed appointments remain historical calendar records; only future/unsubmitted cancellations propagate.
    if(old.kind==='round'&&round?.feedback.status==='submitted')continue;
    if(old.kind==='round'&&old.desired.end<Date.now()&&a?.status==='进行中'&&!round?.cancelled)continue;
    map.set(old.id,{...old.desired,active:false});
   }
   const previous=new Map(existing.map(j=>[j.id,j]));
   for(const t of map.values()){
    const fingerprint=hash(t),old=previous.get(t.id);
    if(old?.desired_hash===fingerprint)continue;
    const remote={...(old?.remote||{uuid:randomUUID(),createKey:randomUUID()})};if(old?.desired_hash!==fingerprint)delete remote.proposal;if(old?.remote.closed&&t.active)remote.createKey=randomUUID();
    if(old?.desired.screeningAt!==t.screeningAt&&t.kind==='review')remote.uuid=randomUUID();
    await conn.execute(`INSERT INTO recruitment_feishu_jobs(id,kind,application_id,round_id,desired,desired_hash,remote,status) VALUES(?,?,?,?,?,?,?,'pending') ON DUPLICATE KEY UPDATE desired=VALUES(desired),desired_hash=VALUES(desired_hash),remote=VALUES(remote),status='pending',attempts=0,error='',next_at=UTC_TIMESTAMP()`,[t.id,t.kind,t.appId,t.roundId,JSON.stringify(t),fingerprint,JSON.stringify(remote)]);
   }
   await conn.commit();
   const [pending]=await conn.query("SELECT * FROM recruitment_feishu_jobs WHERE status IN ('pending','failed') AND next_at<=UTC_TIMESTAMP() ORDER BY next_at,id LIMIT 5");
   for(const row of pending){if(config.pilotUserId&&jobRow(row).desired.userId!==config.pilotUserId)continue;const [[version]]=await conn.query('SELECT (SELECT revision FROM recruitment_state WHERE id=1) AS state_revision,(SELECT revision FROM recruitment_feishu_config WHERE id=1) AS config_revision');if(Number(version.state_revision)!==stateRevision||Number(version.config_revision)!==configRevision)break;const job=jobRow(row);try{
    const checkpoint=remote=>conn.execute('UPDATE recruitment_feishu_jobs SET remote=? WHERE id=? AND desired_hash=?',[JSON.stringify(remote),job.id,job.desired_hash]);
    const remote=await syncFeishuJob(job,client,feishuEnvironment(env).origin,checkpoint);
    await conn.execute("UPDATE recruitment_feishu_jobs SET remote=?,applied_hash=desired_hash,status='synced',error='',attempts=0,next_at=DATE_ADD(UTC_TIMESTAMP(),INTERVAL 60 SECOND) WHERE id=? AND desired_hash=?",[JSON.stringify(remote),job.id,job.desired_hash]);
   }catch(e){await conn.execute("UPDATE recruitment_feishu_jobs SET status='failed',attempts=attempts+1,error=?,next_at=DATE_ADD(UTC_TIMESTAMP(),INTERVAL ? SECOND) WHERE id=?",[(e.message||'同步失败').slice(0,300),Math.min(1800,15*2**Math.min(Number(row.attempts),7)),row.id]);}}
   const [observe]=await conn.query("SELECT * FROM recruitment_feishu_jobs WHERE kind='round' AND status='synced' AND next_at<=UTC_TIMESTAMP() ORDER BY next_at LIMIT 5");
   for(const row of observe){if(config.pilotUserId&&jobRow(row).desired.userId!==config.pilotUserId)continue;try{const job=jobRow(row),remote=await observeFeishuJob(job,client);await conn.execute('UPDATE recruitment_feishu_jobs SET remote=?,error=\'\',next_at=DATE_ADD(UTC_TIMESTAMP(),INTERVAL 60 SECOND) WHERE id=? AND desired_hash=? AND remote=CAST(? AS JSON)',[JSON.stringify(remote),job.id,job.desired_hash,JSON.stringify(job.remote)]);}catch(e){await conn.execute('UPDATE recruitment_feishu_jobs SET error=?,next_at=DATE_ADD(UTC_TIMESTAMP(),INTERVAL 120 SECOND) WHERE id=?',[(e.message||'读取飞书状态失败').slice(0,300),row.id]);}}
  }catch(error){lastError=String(error.code||'SYNC_ERROR');if(conn)try{await conn.rollback();}catch{}console.error('Feishu background sync failed; will retry',{code:lastError});}
  finally{if(locked)try{await conn.query("SELECT RELEASE_LOCK('recruitment-feishu-worker')");}catch{}conn?.release();running=false;lastFinished=new Date().toISOString();}
 }
 const timer=setInterval(tick,15000);timer.unref();tick();return {status:()=>({running,lastTick,lastFinished,lastError}),tick,stop(){stopped=true;clearInterval(timer);}};
}
