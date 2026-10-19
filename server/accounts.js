import {hashPassword} from './auth.js';
import {canManageAccounts} from '../src/permissions.js';
export async function setAccountFrozen(pool,actor,targetId,frozen){
 if(!canManageAccounts(actor))throw Object.assign(Error('仅管理员可以管理账号'),{status:403});
 if(typeof frozen!=='boolean')throw Error('请选择冻结或启用状态');
 const conn=await pool.getConnection();try{
  await conn.beginTransaction();
  const [accounts]=await conn.query('SELECT id,role,frozen FROM recruitment_users ORDER BY id FOR UPDATE');
  if(!accounts.some(u=>u.id===actor.id&&u.role==='admin'&&!u.frozen))throw Object.assign(Error('管理员权限已失效'),{status:403});
  const target=accounts.find(u=>u.id===targetId);if(!target)throw Error('账号不存在');
  if(frozen&&target.id===actor.id)throw Error('不能冻结当前登录的管理员账号');
  if(frozen&&target.role==='admin'&&accounts.filter(u=>u.role==='admin'&&!u.frozen).length<=1)throw Error('至少保留一个启用的管理员账号');
  await conn.execute('UPDATE recruitment_users SET frozen=? WHERE id=?',[frozen,target.id]);
  if(frozen){await conn.execute('DELETE FROM recruitment_sessions WHERE user_id=?',[target.id]);await conn.execute('DELETE FROM recruitment_mcp_tokens WHERE user_id=?',[target.id]);}
  await conn.execute('INSERT INTO recruitment_audit(actor_id,action,target_id) VALUES(?,?,?)',[actor.id,frozen?'冻结账号':'启用账号',target.id]);
  await conn.commit();return {ok:true};
 }catch(error){await conn.rollback();throw error;}finally{conn.release();}
}

export async function resetAccountPassword(pool,actor,targetId,password){
 if(!canManageAccounts(actor))throw Object.assign(Error('仅管理员可以管理账号'),{status:403});
 const hash=await hashPassword(password);
 const conn=await pool.getConnection();try{
  await conn.beginTransaction();
  const [accounts]=await conn.query('SELECT id,role,frozen FROM recruitment_users ORDER BY id FOR UPDATE');
  if(!accounts.some(u=>u.id===actor.id&&u.role==='admin'&&!u.frozen))throw Object.assign(Error('管理员权限已失效'),{status:403});
  if(!accounts.some(u=>u.id===targetId))throw Error('账号不存在');
  await conn.execute('UPDATE recruitment_users SET password_hash=? WHERE id=?',[hash,targetId]);
  await conn.execute('DELETE FROM recruitment_sessions WHERE user_id=?',[targetId]);
  await conn.execute('DELETE FROM recruitment_mcp_tokens WHERE user_id=?',[targetId]);
  await conn.execute('INSERT INTO recruitment_audit(actor_id,action,target_id) VALUES(?,?,?)',[actor.id,'重置账号密码',targetId]);
  await conn.commit();return {ok:true};
 }catch(error){await conn.rollback();throw error;}finally{conn.release();}
}

export async function setAccountRole(pool,actor,targetId,role){
 if(!canManageAccounts(actor))throw Object.assign(Error('仅管理员可以管理账号'),{status:403});
 if(!['admin','HR','interviewer'].includes(role))throw Object.assign(Error('请选择有效角色'),{status:400});
 const conn=await pool.getConnection();try{
  await conn.beginTransaction();
  const [accounts]=await conn.query('SELECT id,role,frozen FROM recruitment_users ORDER BY id FOR UPDATE');
  if(!accounts.some(u=>u.id===actor.id&&u.role==='admin'&&!u.frozen))throw Object.assign(Error('管理员权限已失效'),{status:403});
  const target=accounts.find(u=>u.id===targetId);if(!target)throw Object.assign(Error('账号不存在'),{status:404});
  if(target.role===role){await conn.commit();return {ok:true,role};}
  if(target.id===actor.id)throw Object.assign(Error('不能修改当前登录管理员的角色'),{status:400});
  if(target.role==='admin'&&!target.frozen&&accounts.filter(u=>u.role==='admin'&&!u.frozen).length<=1)throw Object.assign(Error('至少保留一个启用的管理员账号'),{status:400});
  await conn.execute('UPDATE recruitment_users SET role=? WHERE id=?',[role,targetId]);
  await conn.execute('DELETE FROM recruitment_sessions WHERE user_id=?',[targetId]);
  await conn.execute('DELETE FROM recruitment_mcp_tokens WHERE user_id=?',[targetId]);
  await conn.execute('INSERT INTO recruitment_audit(actor_id,action,target_id) VALUES(?,?,?)',[actor.id,`修改账号角色：${target.role} → ${role}`,targetId]);
  await conn.commit();return {ok:true,role};
 }catch(error){await conn.rollback();throw error;}finally{conn.release();}
}
