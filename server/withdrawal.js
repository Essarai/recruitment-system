import express from 'express';
import {readState,users,visibleState} from './database.js';
import {compactCandidates} from './resume-library.js';
import {canWithdrawApplication,canManageAccounts} from '../src/permissions.js';
export function withdrawApplication(app,user,now=new Date().toISOString()){
 if(!canWithdrawApplication(user,app))throw Object.assign(Error('仅可撤回本人发起且面试官尚未操作的进行中应聘；管理员可撤回符合条件的应聘'),{status:403});
 app.status='未录用';app.reason='HR 撤回应聘（面试官尚未操作）';app.withdrawnAt=now;app.withdrawnBy=user.id;app.endedAt=now;
 for(const round of app.rounds)round.cancelled=true;
 app.history.unshift({at:now,actor:user.name,action:'撤回应聘：面试官尚未操作，保留简历及历史记录'});
 return app;
}
export function mountWithdrawal(app,{pool}){
 app.post(['/api/applications/:appId/withdraw','/api/applications/:appId/archive'],express.json({limit:'4kb'}),async(req,res)=>{
  const conn=await pool.getConnection();try{
   await conn.beginTransaction();const {state,revision}=await readState(conn,true);
   if(req.body?.revision!==revision)throw Object.assign(Error('数据已更新，请刷新后重试；面试官可能已经操作'),{status:409});
   const [[actor]]=await conn.execute('SELECT id,name,role,frozen FROM recruitment_users WHERE id=? FOR UPDATE',[req.user.id]);
   if(!actor||actor.frozen)throw Object.assign(Error('账号权限已失效'),{status:403});
   const record=state.applications.find(a=>a.id===req.params.appId);
   if(!record)throw Error('应聘记录不存在');
   const archive=req.path.endsWith('/archive');
   if(archive){
    if(!canManageAccounts(actor)||record.status==='进行中')throw Object.assign(Error('仅管理员可以将已结束的应聘移出列表'),{status:403});
    if(record.archivedAt)throw Error('该应聘已移出列表');
    record.archivedAt=new Date().toISOString();record.archivedBy=actor.id;
    record.history.unshift({at:record.archivedAt,actor:actor.name,action:'将已结束的应聘移出列表，保留简历及历史记录'});
   }else withdrawApplication(record,actor);
   await conn.execute('UPDATE recruitment_state SET revision=revision+1,payload=? WHERE id=1',[JSON.stringify(state)]);
   await conn.execute('INSERT INTO recruitment_audit(actor_id,action,target_id) VALUES(?,?,?)',[actor.id,archive?'移出已结束应聘':'撤回应聘',record.id]);
   await conn.commit();res.json(visibleState(compactCandidates(state,Array.isArray(req.body.candidateIds)?req.body.candidateIds.slice(0,20):[]),actor,await users(pool),revision+1));
  }catch(e){await conn.rollback();throw e;}finally{conn.release();}
 });
}
