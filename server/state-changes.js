import {isDeepStrictEqual as equal} from 'node:util';
import {text,validateHRState} from './validation.js';
import {readState,visibleState} from './database.js';
import {isRecruiter} from '../src/permissions.js';
import {mergePartialCandidates,compactCandidates} from './resume-library.js';
import {validateAvailabilityBookings} from './availability.js';
const collections={candidates:['候选人资料',20000],applications:['这条应聘',5000],templates:['这个流程模板',100]};
const wire=value=>JSON.parse(JSON.stringify(value));

// Compare the actor's public record, never draft contents hidden from that actor.
export function mergeStateChanges(previous,visible,changes){
 if(!changes||typeof changes!=='object'||Array.isArray(changes)||Object.keys(changes).some(key=>!Object.hasOwn(collections,key)))throw Error('保存内容无效');
 const next={...previous};
 for(const [key,[label,max]] of Object.entries(collections)){
  const patches=changes[key];if(!Array.isArray(patches)||patches.length>max)throw Error('保存记录无效');
  const current=new Map(visible[key].map(record=>[record.id,record])),updates=new Map();
  for(const patch of patches){
   const id=text(patch?.id,'记录 ID',80,true);
   if(updates.has(id)||!Object.hasOwn(patch,'before')||!Object.hasOwn(patch,'after')||patch.before===null&&patch.after===null)throw Error('保存记录无效');
   for(const value of [patch.before,patch.after])if(value!==null&&(!value||typeof value!=='object'||Array.isArray(value)||value.id!==id||value._summary))throw Error('请读取完整记录后编辑');
   if(!equal(wire(current.get(id)??null),patch.before))throw Object.assign(Error(`${label}已被他人更新，本次修改尚未保存；请重新打开最新记录核对后再保存`),{status:409});
   updates.set(id,patch.after);
  }
  const existing=new Set(previous[key].map(record=>record.id));
  next[key]=previous[key].flatMap(record=>updates.has(record.id)?updates.get(record.id)===null?[]:[updates.get(record.id)]:[record]);
  for(const [id,record] of updates)if(!existing.has(id)&&record!==null)next[key].push(record);
 }
 return next;
}

export async function saveRecruitmentState(pool,user,body){
 const conn=await pool.getConnection();try{
  await conn.beginTransaction();const {state:previous,revision}=await readState(conn,true);
  if(!body.changes&&body.revision!==revision)throw Object.assign(Error('数据已被他人更新，请刷新页面后重试；本次修改尚未保存'),{status:409});
  // Keep permission/file validation on the locked transaction connection.
  const [context]=await conn.query(`SELECT 'user' AS kind,id,username,name,role,frozen,NULL AS mime,NULL AS size FROM recruitment_users
   UNION ALL SELECT 'file',id,NULL,name,NULL,NULL,mime,size FROM recruitment_files WHERE object_key LIKE 'resumes/%'`);
  const people=context.filter(row=>row.kind==='user').map(({id,username,name,role,frozen})=>({id,username,name,role,frozen})),files=context.filter(row=>row.kind==='file');
  const actor=people.find(u=>u.id===user.id);if(!actor||actor.frozen||!isRecruiter(actor))throw Object.assign(Error('账号权限已变化，请重新登录'),{status:403});
  const input=body.changes?mergeStateChanges(previous,visibleState(previous,actor,people,revision),body.changes):mergePartialCandidates(previous,body);
  const state=validateHRState(previous,input,people.filter(u=>u.role==='interviewer').map(u=>u.name),files,actor.name,people.filter(u=>u.role==='interviewer'&&!u.frozen).map(u=>u.name),actor);
  const changed=!body.changes||!equal(previous,state);
  if(changed){
   if(!equal(previous.applications,state.applications))await validateAvailabilityBookings(conn,previous,state,people);
   await conn.execute('UPDATE recruitment_state SET revision=revision+1,payload=? WHERE id=1',[JSON.stringify(state)]);
   for(const t of previous.templates.filter(t=>!state.templates.some(n=>n.id===t.id)))await conn.execute('INSERT INTO recruitment_audit(actor_id,action,target_id) VALUES(?,?,?)',[actor.id,'删除流程模板：'+t.name,t.id]);
   await conn.execute('INSERT INTO recruitment_audit(actor_id,action,target_id) VALUES(?,?,?)',[actor.id,'更新招聘数据','state']);
  }
  await conn.commit();return visibleState(body.partialCandidates===true?compactCandidates(state,Array.isArray(body.loadedCandidateIds)?body.loadedCandidateIds:[]):state,actor,people,revision+(changed?1:0));
 }catch(error){await conn.rollback();throw error;}finally{conn.release();}
}
