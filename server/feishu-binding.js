import express from 'express';
import {randomBytes} from 'node:crypto';
import {tokenHash,getSessionCookie} from './auth.js';

export function bindingEnvironment(env=process.env){
 const configured=env.FEISHU_OAUTH_REDIRECT_URI||'';
 let redirectUri=configured;
 if(!redirectUri&&env.PUBLIC_ORIGIN)try{const origin=new URL(env.PUBLIC_ORIGIN);if(origin.pathname==='/'&&!origin.search&&!origin.hash&&!origin.username&&!origin.password)redirectUri=origin.origin+'/api/feishu/bind/callback';}catch{}
 try{
  const url=new URL(redirectUri);
  if(url.username||url.password||url.search||url.hash||url.pathname!=='/api/feishu/bind/callback'||!(url.protocol==='https:'||env.NODE_ENV!=='production'&&url.protocol==='http:'&&['localhost','127.0.0.1'].includes(url.hostname)))throw Error();
  const ready=Boolean(env.FEISHU_APP_ID&&env.FEISHU_APP_SECRET);
  return {ready,redirectUri:url.href,origin:url.origin,reason:ready?'':'飞书应用凭据尚未配置'};
 }catch{return {ready:false,redirectUri:'',origin:'',reason:'飞书授权回调地址未配置或无效，请管理员检查 FEISHU_OAUTH_REDIRECT_URI'};}
}

export async function initializeFeishuBinding(pool){
 await pool.query(`CREATE TABLE IF NOT EXISTS recruitment_feishu_bindings(user_id VARCHAR(80) PRIMARY KEY,app_id VARCHAR(100) NOT NULL,tenant_key VARCHAR(100) NOT NULL,open_id VARCHAR(100) NOT NULL,name VARCHAR(200) NOT NULL,bound_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE KEY feishu_identity(app_id,tenant_key,open_id))`);
 await pool.query(`CREATE TABLE IF NOT EXISTS recruitment_feishu_oauth(state_hash CHAR(64) PRIMARY KEY,user_id VARCHAR(80) NOT NULL,session_hash CHAR(64) NOT NULL,expires_at DATETIME NOT NULL)`);
}
export function bindingAuthorizationUrl(env,state){
 const config=bindingEnvironment(env);if(!config.ready)throw Error('飞书账号绑定尚未配置');
 const url=new URL('https://accounts.feishu.cn/open-apis/authen/v1/authorize');
 for(const [key,value] of Object.entries({client_id:env.FEISHU_APP_ID,response_type:'code',redirect_uri:config.redirectUri,state}))url.searchParams.set(key,value);
 return url.href;
}
export async function fetchBindingIdentity(code,{env=process.env,fetcher=fetch}={}){
 const response=await fetcher('https://open.feishu.cn/open-apis/authen/v2/oauth/token',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({grant_type:'authorization_code',client_id:env.FEISHU_APP_ID,client_secret:env.FEISHU_APP_SECRET,code,redirect_uri:bindingEnvironment(env).redirectUri}),signal:AbortSignal.timeout(15000)});
 const token=await response.json();if(!response.ok||token.code&&token.code!==0||!token.access_token)throw Error(`飞书授权失败（${token.code??response.status}），请重新绑定`);
 const info=await fetcher('https://open.feishu.cn/open-apis/authen/v1/user_info',{headers:{Authorization:'Bearer '+token.access_token},signal:AbortSignal.timeout(15000)});
 const value=await info.json(),person=value.data;if(!info.ok||value.code!==0||!/^ou_[A-Za-z0-9_-]+$/.test(person?.open_id||'')||typeof person?.tenant_key!=='string'||!person.tenant_key)throw Error('无法获取飞书身份，请检查应用授权');
 if(env.FEISHU_TENANT_KEY&&person.tenant_key!==env.FEISHU_TENANT_KEY)throw Error('请使用公司所属企业的飞书账号');
 return {openId:person.open_id,tenantKey:person.tenant_key,name:String(person.name||'飞书用户').slice(0,200)};
}
// Public landing page performs a same-origin POST, preserving the existing Strict session cookie.
export function mountFeishuBindingCallback(app){
 app.get('/api/feishu/bind/callback',(req,res)=>{
  const nonce=randomBytes(18).toString('base64');res.set({'Cache-Control':'no-store','Referrer-Policy':'no-referrer','Content-Security-Policy':`default-src 'none'; script-src 'nonce-${nonce}'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'`});
  let problem='';
  if(req.query.error)problem='飞书授权未完成或已取消，请返回系统重新绑定';
  else if(typeof req.query.code!=='string'||!req.query.code)problem='回调缺少飞书授权码（code），请返回系统点击“绑定飞书”，不要直接打开或刷新回调地址';
  else if(typeof req.query.state!=='string'||!/^[a-f0-9]{64}$/.test(req.query.state))problem='回调缺少或包含无效的授权校验参数（state），请返回系统重新绑定';
  if(problem)return res.status(400).type('html').send(`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>绑定飞书</title><body><p>${problem}</p><a href="/">返回招聘系统重新绑定</a></body></html>`);
  res.type('html').send(`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>绑定飞书</title><body><p id="status">正在完成飞书绑定…</p><a href="/">返回招聘系统</a><script nonce="${nonce}">
const query=new URLSearchParams(location.search);history.replaceState(null,'',location.pathname);
(async()=>{try{if(query.has('error'))throw Error('已取消飞书授权，请返回系统重试');const response=await fetch('/api/feishu/bind/complete',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:query.get('code'),state:query.get('state')})});const result=await response.json();if(!response.ok)throw Error(result.error||'绑定失败');location.replace('/?feishu=bound');}catch(error){document.getElementById('status').textContent=error.message;}})();
</script></body></html>`);
 });
}
export function mountFeishuBinding(app,{pool,env=process.env,identity=code=>fetchBindingIdentity(code,{env})}){
 app.get('/api/feishu/binding',async(req,res)=>{
  const [[row]]=await pool.execute('SELECT name,bound_at FROM recruitment_feishu_bindings WHERE user_id=? AND app_id=?',[req.user.id,env.FEISHU_APP_ID||'']);
  const config=bindingEnvironment(env);res.json({ready:config.ready,reason:config.reason,binding:row?{name:row.name,boundAt:row.bound_at}:null});
 });
 app.post('/api/feishu/bind/start',async(req,res)=>{
  const state=randomBytes(32).toString('hex'),url=bindingAuthorizationUrl(env,state);
  await pool.execute('DELETE FROM recruitment_feishu_oauth WHERE expires_at<=UTC_TIMESTAMP() OR user_id=?',[req.user.id]);
  await pool.execute('INSERT INTO recruitment_feishu_oauth(state_hash,user_id,session_hash,expires_at) VALUES(?,?,?,DATE_ADD(UTC_TIMESTAMP(),INTERVAL 10 MINUTE))',[tokenHash(state),req.user.id,tokenHash(getSessionCookie(req))]);
  res.json({url});
 });
 app.post('/api/feishu/bind/complete',express.json({limit:'8kb'}),async(req,res)=>{
  const {code,state}=req.body||{};if(typeof code!=='string'||!code||code.length>4096)throw Error('缺少有效的飞书授权码（code），请返回系统重新绑定');
  if(typeof state!=='string'||!/^[a-f0-9]{64}$/.test(state))throw Error('缺少有效的授权校验参数（state），请返回系统重新绑定');
  const [consumed]=await pool.execute('DELETE FROM recruitment_feishu_oauth WHERE state_hash=? AND user_id=? AND session_hash=? AND expires_at>UTC_TIMESTAMP()',[tokenHash(state),req.user.id,tokenHash(getSessionCookie(req))]);
  if(consumed.affectedRows!==1)throw Error('授权已过期或登录账号已变化，请重新绑定');
  const person=await identity(code),conn=await pool.getConnection();
  try{
   await conn.beginTransaction();
   // Serialize competing binds to enforce one account per Feishu identity.
   await conn.query('SELECT id FROM recruitment_feishu_config WHERE id=1 FOR UPDATE');
   const [[actor]]=await conn.execute('SELECT u.id FROM recruitment_users u JOIN recruitment_sessions s ON u.id=s.user_id WHERE u.id=? AND u.frozen=FALSE AND s.token_hash=? AND s.expires_at>UTC_TIMESTAMP() FOR UPDATE',[req.user.id,tokenHash(getSessionCookie(req))]);
   if(!actor)throw Object.assign(Error('登录已失效，请重新登录后绑定'),{status:403});
   const [[existing]]=await conn.execute('SELECT user_id FROM recruitment_feishu_bindings WHERE app_id=? AND tenant_key=? AND open_id=?',[env.FEISHU_APP_ID,person.tenantKey,person.openId]);
   if(existing&&existing.user_id!==actor.id)throw Object.assign(Error('该飞书账号已绑定其他系统账号'),{status:409});
   await conn.execute('INSERT INTO recruitment_feishu_bindings(user_id,app_id,tenant_key,open_id,name) VALUES(?,?,?,?,?) ON DUPLICATE KEY UPDATE app_id=VALUES(app_id),tenant_key=VALUES(tenant_key),open_id=VALUES(open_id),name=VALUES(name),bound_at=CURRENT_TIMESTAMP',[actor.id,env.FEISHU_APP_ID,person.tenantKey,person.openId,person.name]);
   await conn.query('UPDATE recruitment_feishu_config SET revision=revision+1 WHERE id=1');
   await conn.execute('INSERT INTO recruitment_audit(actor_id,action,target_id) VALUES(?,?,?)',[actor.id,'绑定本人飞书账号',actor.id]);
   await conn.commit();res.json({ok:true});
  }catch(error){await conn.rollback();if(error.code==='ER_DUP_ENTRY')throw Object.assign(Error('该飞书账号已被绑定'),{status:409});throw error;}finally{conn.release();}
 });
}
