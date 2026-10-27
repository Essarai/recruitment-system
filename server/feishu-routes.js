import express from 'express';
import {randomUUID} from 'node:crypto';
import {verifyFeishuEvent,feishuEnvironment,createFeishuClient,hash} from './feishu-client.js';
import {readFeishuConfig,readJobs,jobRow} from './feishu-store.js';
import {feishuDesired,remoteSchedule,scheduleSignature,parseJSON} from './feishu-model.js';
import {readState,users} from './database.js';
import {canManageAccounts,canManageApplication,isRecruiter} from '../src/permissions.js';
import {validateSchedule} from '../src/model.js';
import {validateAvailabilityBookings} from './availability.js';
const denied=message=>Object.assign(Error(message),{status:403});
export function validateFeishuConfig(input,people,old,ready,now=new Date().toISOString()){
 if(typeof input?.enabled!=='boolean'||typeof input.allowAttendeeEdit!=='boolean'||typeof input.calendarId!=='string'||input.calendarId.length>200)throw Error('飞书配置格式无效');
 if(input.enabled&&(!ready||!input.calendarId.trim()))throw Error('请先配置服务端应用凭据及日历 ID');
 if(old.calendarId&&old.calendarId!==input.calendarId.trim())throw Error('已保存的日历 ID 不支持直接切换，请先处理原日历的同步记录');
 const pilotUserId=input.pilotUserId===undefined?old.pilotUserId||'':input.pilotUserId;
 if(typeof pilotUserId!=='string'||pilotUserId&&!people.some(p=>p.id===pilotUserId&&p.role==='interviewer'&&!p.frozen))throw Error('请选择有效的试用面试官');
 // Binding identities are server-owned and can only be changed through self OAuth.
 return {...old,enabled:input.enabled,allowAttendeeEdit:input.allowAttendeeEdit,calendarId:input.calendarId.trim(),bindings:old.bindings,pilotUserId,enabledAt:old.enabledAt||input.enabled&&now||null};
}
export function mountFeishuCallback(app,{pool,env=process.env}){
 app.post('/api/feishu/events',express.raw({type:'application/json',limit:'128kb'}),async(req,res)=>{
  let event;try{event=verifyFeishuEvent(req.body,req.headers,env);}catch{return res.status(403).json({error:'回调验证失败'});}
  if(event.type==='url_verification')return res.json({challenge:event.challenge});
  if(event.header?.event_type!=='calendar.calendar.event.changed_v4'&&event.header?.event_type!=='calendar.event.changed_v4')return res.json({code:0});
  const id=event.header.event_id;if(typeof id!=='string'||id.length>200)return res.status(400).json({error:'事件 ID 无效'});
  const [result]=await pool.execute('INSERT IGNORE INTO recruitment_feishu_inbox(event_id) VALUES(?)',[id]);
  if(result.affectedRows)await pool.query("UPDATE recruitment_feishu_jobs SET next_at=UTC_TIMESTAMP() WHERE kind='round' AND status='synced'");
  res.json({code:0});
 });
}
export function mountFeishuRoutes(app,{pool,env=process.env,client=createFeishuClient({env}),workerStatus=()=>null}){
 const admin=(req,res,next)=>canManageAccounts(req.user)?next():res.status(403).json({error:'仅管理员可设置飞书集成'});
 app.get('/api/feishu/config',admin,async(req,res)=>{const [{config,revision},people]=await Promise.all([readFeishuConfig(pool),users(pool)]);res.json({config,revision,environment:feishuEnvironment(env),worker:workerStatus(),users:people.map(({id,name,role,frozen})=>({id,name,role,frozen}))});});
 app.put('/api/feishu/config',admin,express.json({limit:'64kb'}),async(req,res)=>{
  const conn=await pool.getConnection();try{
   await conn.beginTransaction();await readState(conn,true);const people=await users(conn),actor=people.find(u=>u.id===req.user.id);
   if(!actor||actor.frozen||!canManageAccounts(actor))throw denied('管理员权限已变化');
   const {config:old,revision}=await readFeishuConfig(conn,true);if(req.body.revision!==revision)throw Object.assign(Error('配置已更新，请重新加载'),{status:409});
   const config=validateFeishuConfig(req.body.config,people,old,feishuEnvironment(env).ready);
   await conn.execute('UPDATE recruitment_feishu_config SET revision=revision+1,payload=? WHERE id=1',[JSON.stringify(config)]);
   await conn.execute('INSERT INTO recruitment_audit(actor_id,action,target_id) VALUES(?,?,?)',[actor.id,config.enabled?'更新并启用飞书集成':'更新并暂停飞书集成','feishu']);await conn.commit();res.json({ok:true});
  }catch(e){await conn.rollback();throw e;}finally{conn.release();}
 });
 app.post('/api/feishu/test',admin,async(req,res)=>{
  const {config}=await readFeishuConfig(pool);if(!feishuEnvironment(env).ready||!config.calendarId)throw Error('请先配置环境变量并保存日历 ID');
  const result=await client.call('/calendar/v4/calendars/'+encodeURIComponent(config.calendarId));
  if(!['owner','writer'].includes(result.calendar?.role))throw Error('应用对日历没有编辑权限');
  res.json({ok:true,message:'飞书认证及日历编辑权限检查通过；未发送消息或创建日程。'});
 });
 app.post('/api/feishu/subscribe',admin,async(req,res)=>{const {config}=await readFeishuConfig(pool);if(!feishuEnvironment(env).eventsReady)throw Error('事件回调尚未配置，当前使用定时查询即可');if(!feishuEnvironment(env).ready||!config.calendarId)throw Error('飞书尚未配置');await client.call('/calendar/v4/calendars/'+encodeURIComponent(config.calendarId)+'/events/subscription',{method:'POST'});res.json({ok:true,message:'已提交日程变更订阅。仍保留定时核对作为补偿。'});});
 app.post('/api/feishu/backfill',admin,async(req,res)=>{
  const conn=await pool.getConnection();try{await conn.beginTransaction();await readState(conn,true);const {config}=await readFeishuConfig(conn,true);if(!config.enabled)throw Error('请先启用飞书同步');config.backfill=true;await conn.execute('UPDATE recruitment_feishu_config SET revision=revision+1,payload=? WHERE id=1',[JSON.stringify(config)]);await conn.execute('INSERT INTO recruitment_audit(actor_id,action,target_id) VALUES(?,?,?)',[req.user.id,'补同步待确认简历及未来面试','feishu']);await conn.commit();res.json({ok:true});}catch(e){await conn.rollback();throw e;}finally{conn.release();}
 });
 app.get('/api/feishu/jobs',async(req,res)=>{
  const [{state},jobs,{config}]=await Promise.all([readState(pool),readJobs(pool),readFeishuConfig(pool)]);const apps=new Map(state.applications.map(a=>[a.id,a]));
  const rows=jobs.filter(j=>req.user.role==='admin'||isRecruiter(req.user)&&apps.has(j.application_id)||req.user.role==='interviewer'&&j.desired.userId===req.user.id).filter(j=>!req.query.appId||j.application_id===req.query.appId).map(j=>{const a=apps.get(j.application_id),external=j.kind==='round'&&a?.rounds.find(r=>r.id===j.round_id)?.calendarSource==='external';return {id:j.id,appId:j.application_id,roundId:j.round_id,title:j.desired.title,kind:j.kind,status:j.status,error:j.error,updatedAt:j.updated_at,active:external?false:j.desired.active,rsvp:external?'':j.remote.rsvp||'',checkedAt:external?null:j.remote.checkedAt||null,proposal:external?null:j.remote.proposal||null,canManage:canManageApplication(req.user,a),userId:j.desired.userId,...(external?{calendarSource:'external',calendarCleanupPending:!!j.remote.eventId&&!j.remote.closed}:{})};});
  res.json({enabled:config.enabled,ready:feishuEnvironment(env).ready,rows});
 });
 app.post('/api/feishu/jobs/:id/retry',express.json({limit:'1kb'}),async(req,res)=>{
  const conn=await pool.getConnection();try{await conn.beginTransaction();const {state}=await readState(conn,true),[people]=await conn.query('SELECT id,name,role,frozen FROM recruitment_users WHERE id=? FOR UPDATE',[req.user.id]);const actor=people[0];const [[row]]=await conn.execute('SELECT * FROM recruitment_feishu_jobs WHERE id=? FOR UPDATE',[req.params.id]);
   if(!row||!actor||actor.frozen||!canManageApplication(actor,state.applications.find(a=>a.id===row.application_id)))throw denied('无权重试此同步');
   const target=state.applications.find(a=>a.id===row.application_id)?.rounds.find(r=>r.id===row.round_id);
   if(target?.calendarSource!=='external'&&parseJSON(row.remote).proposal)throw Error('请先接受或拒绝飞书改期请求');
   await conn.execute("UPDATE recruitment_feishu_jobs SET status='pending',next_at=UTC_TIMESTAMP(),attempts=0,error='' WHERE id=?",[row.id]);await conn.commit();res.json({ok:true});
  }catch(e){await conn.rollback();throw e;}finally{conn.release();}
 });
 app.post('/api/feishu/jobs/:id/proposal',express.json({limit:'2kb'}),async(req,res)=>{
  if(!['approve','reject'].includes(req.body?.decision))throw Error('请选择接受或拒绝改期');
  const conn=await pool.getConnection();try{
   await conn.beginTransaction();const {state,revision}=await readState(conn,true),people=await users(conn),actor=people.find(u=>u.id===req.user.id);
   const [[row]]=await conn.execute('SELECT * FROM recruitment_feishu_jobs WHERE id=? FOR UPDATE',[req.params.id]);if(!row)throw Error('同步记录不存在');const job=jobRow(row),a=state.applications.find(a=>a.id===job.application_id),r=a?.rounds.find(r=>r.id===job.round_id),proposal=job.remote.proposal;
   if(!actor||actor.frozen||!canManageApplication(actor,a))throw denied('仅发起该应聘的 HR 或管理员可处理');
   if(!r||r.calendarSource==='external'||a.status!=='进行中'||r.feedback.status==='submitted'||!proposal)throw Error('该改期请求已失效');
   const {config}=await readFeishuConfig(conn),current=feishuDesired(state,people,{...config,backfill:true}).find(t=>t.id===job.id);
   if(!current||hash(current)!==proposal.baseHash||proposal.remoteHash!==req.body.remoteHash)throw Object.assign(Error('安排或飞书请求已更新，请刷新后重试'),{status:409});
   const remote={...job.remote};delete remote.proposal;
   if(req.body.decision==='approve'){
    if(proposal.cancelled){r.cancelled=true;remote.closed=true;}
    else{const next={...r,time:proposal.time,duration:proposal.duration,location:proposal.location};validateSchedule(a,r,next,people.filter(u=>u.role==='interviewer'&&!u.frozen).map(u=>u.name));const old=structuredClone(state);Object.assign(r,next,{cancelled:false});await validateAvailabilityBookings(conn,old,state,people);remote.schedule=scheduleSignature(proposal);}
    r.scheduleEvents=[...(r.scheduleEvents||[]),{type:proposal.cancelled?'cancelled':'rescheduled',at:new Date().toISOString(),actorId:actor.id,actorName:actor.name}];
   }else if(proposal.cancelled){remote.closed=true;remote.createKey=randomUUID();}
   a.history.unshift({at:new Date().toISOString(),actor:actor.name,action:`${req.body.decision==='approve'?'接受':'拒绝'}飞书${proposal.cancelled?'取消面试':'改期'}请求`});
   const desired=feishuDesired(state,people,{...config,backfill:true}).find(t=>t.id===job.id)||{...current,active:false},fingerprint=hash(desired);
   await conn.execute("UPDATE recruitment_feishu_jobs SET desired=?,desired_hash=?,applied_hash=?,remote=?,status=?,error='',next_at=UTC_TIMESTAMP() WHERE id=?",[JSON.stringify(desired),fingerprint,req.body.decision==='approve'?fingerprint:null,JSON.stringify(remote),req.body.decision==='approve'?'synced':'pending',job.id]);
   await conn.execute('UPDATE recruitment_state SET revision=revision+1,payload=? WHERE id=1',[JSON.stringify(state)]);await conn.execute('INSERT INTO recruitment_audit(actor_id,action,target_id) VALUES(?,?,?)',[actor.id,`${req.body.decision==='approve'?'接受':'拒绝'}飞书日程变更`,r.id]);await conn.commit();res.json({ok:true,revision:revision+1});
  }catch(e){await conn.rollback();throw e;}finally{conn.release();}
 });
}
