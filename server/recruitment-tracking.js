import express from 'express';
import {isDeepStrictEqual as equal} from 'node:util';
import {readState,users} from './database.js';
import {canManageApplication,isRecruiter} from '../src/permissions.js';
import {text} from './validation.js';

export function trackedDate(value){
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value||''))return false;
 const stamp=Date.parse(value+'T00:00:00Z');
 return Number.isFinite(stamp)&&new Date(stamp).toISOString().slice(0,10)===value;
}

export function applyRecruitmentTracking(state,people,actor,body,today){
 if(!isRecruiter(actor)||actor.frozen)throw Object.assign(Error('无权更新招聘跟踪'),{status:403});
 const key=text(body.id,'记录 ID',80,true),value=body.value||{};
 const tracking=state.recruitmentTracking ||= {goals:[],offers:[],contacts:[]};
 let list,index,next;
 if(body.kind==='goal'){
  if(actor.role!=='admin')throw Object.assign(Error('仅管理员可设置招聘目标'),{status:403});
  const month=text(value.month,'目标月份',7,true),job=text(value.job,'岗位',160,true);
  if(!trackedDate(month+'-01')||!Number.isSafeInteger(value.target)||value.target<0||value.target>10000)throw Error('请选择有效月份，目标须为 0～10000 的整数');
  if(!people.some(u=>u.id===key&&isRecruiter(u)))throw Error('请选择招聘负责人');
  if(!state.templates.some(t=>t.name===job)&&!state.applications.some(a=>a.job===job))throw Error('岗位不存在');
  list=tracking.goals;index=list.findIndex(r=>r.ownerId===key&&r.month===month&&r.job===job);
  next={ownerId:key,month,job,target:value.target};
 }else if(body.kind==='offer'){
  const application=state.applications.find(a=>a.id===key);
  if(!application||!canManageApplication(actor,application))throw Object.assign(Error('仅应聘发起 HR 或管理员可以登记 Offer'),{status:403});
  if(application.status!=='公司决定录用')throw Error('请先在应聘详情登记公司决定录用');
  const dates=['issued','responded','joined'];
  for(const field of dates)if(value[field]!==undefined&&value[field]!==''&&(!trackedDate(value[field])||value[field]>today))throw Error('请输入有效且不晚于今天的实际日期');
  const {issued='',responded='',joined='',response=''}=value;
  if(!['','accepted','declined'].includes(response)||Boolean(response)!==Boolean(responded)||!issued&&(responded||joined)||responded&&responded<issued||joined&&(response!=='accepted'||joined<responded))throw Error('请按发出 Offer、候选人回复、实际入职顺序登记');
  list=tracking.offers;index=list.findIndex(r=>r.id===key);next={id:key,issued,responded,joined,response};
 }else if(body.kind==='contact'){
  const candidate=state.candidates.find(c=>c.id===key);
  if(!candidate||actor.role!=='admin'&&candidate.createdBy!==actor.id)throw Object.assign(Error('仅简历首次录入人或管理员可以登记沟通情况'),{status:403});
  list=tracking.contacts;index=list.findIndex(r=>r.id===key);
  next={id:key,intent:text(value.intent,'求职意向',500),availability:text(value.availability,'到岗时间',500),recommendation:text(value.recommendation,'推进建议',500)};
 }else throw Error('无效的招聘跟踪操作');
 const current=list[index]||null;
 if(!equal(current,body.before??null)&&!equal(current,next))throw Object.assign(Error('记录已被他人更新，请刷新大盘后重试'),{status:409});
 if(equal(current,next))return false;
 if(index===-1)list.push(next);else list[index]=next;
 return true;
}

export function mountRecruitmentTracking(app,pool){
 app.put('/api/recruitment-tracking',express.json({limit:'8kb'}),async(req,res)=>{
  const conn=await pool.getConnection();
  try{
   await conn.beginTransaction();
   const {state}=await readState(conn,true),people=await users(conn),actor=people.find(u=>u.id===req.user.id);
   const today=new Date(Date.now()+8*3600000).toISOString().slice(0,10);
   if(applyRecruitmentTracking(state,people,actor,req.body,today)){
    await conn.execute('UPDATE recruitment_state SET revision=revision+1,payload=? WHERE id=1',[JSON.stringify(state)]);
    await conn.execute('INSERT INTO recruitment_audit(actor_id,action,target_id) VALUES(?,?,?)',[actor.id,'更新招聘跟踪 '+req.body.kind,req.body.id]);
   }
   await conn.commit();res.json({ok:true});
  }catch(error){await conn.rollback();throw error;}finally{conn.release();}
 });
}
