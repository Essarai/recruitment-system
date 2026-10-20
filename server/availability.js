import express from 'express';
import {normalizeAvailability,validDay,appointmentTime,fitsAvailability,overlaps} from '../src/availability.js';
import {readState} from './database.js';
export function busyTimes(state,name,exclude={}){
 return state.applications.filter(a=>a.status==='进行中').flatMap(a=>a.rounds.filter(r=>r.interviewer===name&&r.time&&!r.cancelled&&!(a.id===exclude.appId&&r.id===exclude.roundId)).map(r=>({start:appointmentTime(r.time),end:appointmentTime(r.time)+(r.duration||60)*60000}))).filter(r=>Number.isFinite(r.start));
}
export function checkAvailability(previous,next,settingsByName,now=Date.now()){
 const oldApps=new Map(previous.applications.map(a=>[a.id,a]));
 for(const a of next.applications)for(const r of a.rounds){
  const old=oldApps.get(a.id)?.rounds.find(x=>x.id===r.id);
  if(a.status!=='进行中'||r.cancelled||!r.time||old&&!old.cancelled&&old.time===r.time&&old.interviewer===r.interviewer&&(old.duration||60)===(r.duration||60))continue;
  const start=appointmentTime(r.time),duration=r.duration||60;
  if(!Number.isFinite(start)||start<=now)throw Error('请选择未来的面试时间');
  if(!fitsAvailability(settingsByName.get(r.interviewer),r.time,duration))throw Error('该时间不在面试官有效的可用时段内，请刷新可约时间后重选');
  if(busyTimes(next,r.interviewer,{appId:a.id,roundId:r.id}).some(b=>overlaps({start,end:start+duration*60000},b)))throw Error('面试官该时段已有面试，请重新选择时间');
 }
}
export async function validateAvailabilityBookings(conn,previous,next,userList){
 const [rows]=await conn.query('SELECT user_id,payload FROM recruitment_availability');
 const byId=new Map(rows.map(r=>[r.user_id,typeof r.payload==='string'?JSON.parse(r.payload):r.payload]));
 checkAvailability(previous,next,new Map(userList.map(u=>[u.name,byId.get(u.id)])));
}
export function mountAvailability(app,{pool}){
 app.get('/api/interview-availability/:id',async(req,res)=>{
  if(!['admin','HR','interviewer'].includes(req.user.role)||req.user.role==='interviewer'&&req.params.id!==req.user.id)return res.status(403).json({error:'无权查看该可用时间'});
  const [[person]]=await pool.execute("SELECT id,name FROM recruitment_users WHERE id=? AND role='interviewer' AND frozen=FALSE",[req.params.id]);
  if(!person)return res.status(404).json({error:'面试官不存在或已停用'});
  const [[row]]=await pool.execute('SELECT revision,payload FROM recruitment_availability WHERE user_id=?',[person.id]);
  const settings=row?(typeof row.payload==='string'?JSON.parse(row.payload):row.payload):null;
  const day=String(req.query.day||'');if(day&&!validDay(day))return res.status(400).json({error:'日期无效'});
  const {state}=await readState(pool),start=day?appointmentTime(day+'T00:00'):NaN;
  const busy=day?busyTimes(state,person.name,{appId:req.query.appId,roundId:req.query.roundId}).filter(b=>b.start<start+86400000&&b.end>start):[];
  res.json({settings,revision:Number(row?.revision||0),busy});
 });
 app.put('/api/interview-availability',express.json({limit:'64kb'}),async(req,res)=>{
  if(req.user.role!=='interviewer')return res.status(403).json({error:'仅面试官可以设置本人的可用时间'});
  const settings=normalizeAvailability(req.body?.settings),revision=req.body?.revision;
  if(!Number.isSafeInteger(revision)||revision<0)return res.status(400).json({error:'版本无效，请刷新后重试'});
  const conn=await pool.getConnection();try{
   await conn.beginTransaction();await readState(conn,true);
   const [[person]]=await conn.execute('SELECT role,frozen FROM recruitment_users WHERE id=? FOR UPDATE',[req.user.id]);
   if(!person||person.role!=='interviewer'||person.frozen)throw Object.assign(Error('账号权限已变化，请重新登录'),{status:403});
   const [[old]]=await conn.execute('SELECT revision FROM recruitment_availability WHERE user_id=? FOR UPDATE',[req.user.id]);
   if(Number(old?.revision||0)!==revision)throw Object.assign(Error('可用时间已在其他页面更新，请重新加载后修改'),{status:409});
   await conn.execute('INSERT INTO recruitment_availability(user_id,revision,payload) VALUES(?,?,?) ON DUPLICATE KEY UPDATE revision=VALUES(revision),payload=VALUES(payload)',[req.user.id,revision+1,JSON.stringify(settings)]);
   await conn.execute('INSERT INTO recruitment_audit(actor_id,action,target_id) VALUES(?,?,?)',[req.user.id,'更新面试可用时间',req.user.id]);
   await conn.commit();res.json({settings,revision:revision+1});
  }catch(e){await conn.rollback();throw e;}finally{conn.release();}
 });
}
