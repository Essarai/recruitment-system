import {test} from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {bindingEnvironment,bindingAuthorizationUrl,fetchBindingIdentity,mountFeishuBinding,mountFeishuBindingCallback} from '../server/feishu-binding.js';
const env={FEISHU_APP_ID:'cli_test',FEISHU_APP_SECRET:'secret-test',FEISHU_OAUTH_REDIRECT_URI:'http://localhost:4173/api/feishu/bind/callback'};
test('OAuth redirect is fixed, HTTPS in production; authorization state is preserved without leaking secret',()=>{
 assert.equal(bindingEnvironment(env).ready,true);
 assert.equal(bindingEnvironment({...env,NODE_ENV:'production'}).ready,false);
 for(const uri of ['http://evil.example/api/feishu/bind/callback','https://site.example/api/feishu/bind/callback?next=evil','https://user:pass@site.example/api/feishu/bind/callback'])assert.equal(bindingEnvironment({...env,FEISHU_OAUTH_REDIRECT_URI:uri}).ready,false);
 const url=new URL(bindingAuthorizationUrl(env,'state'));assert.equal(url.searchParams.get('state'),'state');assert.equal(url.searchParams.get('redirect_uri'),env.FEISHU_OAUTH_REDIRECT_URI);assert.equal(url.href.includes('secret-test'),false);
});
test('identity uses server-side token exchange, rejects foreign tenant and never returns credentials',async()=>{
 const calls=[],fetcher=async(url,options)=>{calls.push({url,options});return {ok:true,json:async()=>calls.length===1?{code:0,access_token:'user-secret'}:{code:0,data:{open_id:'ou_self',tenant_key:'company',name:'本人'}}};};
 assert.deepEqual(await fetchBindingIdentity('code',{env,fetcher}),{openId:'ou_self',tenantKey:'company',name:'本人'});
 assert.equal(JSON.parse(calls[0].options.body).redirect_uri,env.FEISHU_OAUTH_REDIRECT_URI);
 await assert.rejects(fetchBindingIdentity('code',{env:{...env,FEISHU_TENANT_KEY:'other'},fetcher:async url=>({ok:true,json:async()=>url.includes('/oauth/token')?{access_token:'secret'}:{code:0,data:{open_id:'ou_self',tenant_key:'company'}}})}),/公司所属企业/);
});
test('callback is public with CSP and no interpolation; consumed/expired/wrong-session states never exchange code',async t=>{
 let exchanges=0,transactionStarted=false;
 const pool={execute:async(sql,params)=>{assert.ok(sql.includes('session_hash=?'));assert.equal(params[1],'me');return [{affectedRows:0}];},getConnection:async()=>{transactionStarted=true;throw Error('unexpected');}};
 const app=express();mountFeishuBindingCallback(app);app.use((req,res,next)=>{req.user={id:'me'};next();});mountFeishuBinding(app,{pool,env,identity:async()=>{exchanges++;}});app.use((e,req,res,next)=>res.status(400).json({error:e.message}));
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>server.close());const root='http://127.0.0.1:'+server.address().port;
 const callback=await fetch(root+'/api/feishu/bind/callback?code=%3Cscript%3E&state='+ 'a'.repeat(64));assert.ok(callback.headers.get('content-security-policy').includes("frame-ancestors 'none'"));assert.equal((await callback.text()).includes('<script>'),false);
 const bare=await fetch(root+'/api/feishu/bind/callback');assert.equal(bare.status,400);assert.match(await bare.text(),/缺少飞书授权码/);
 const missingState=await fetch(root+'/api/feishu/bind/callback?code=code');assert.equal(missingState.status,400);assert.match(await missingState.text(),/state/);
 const response=await fetch(root+'/api/feishu/bind/complete',{method:'POST',headers:{'Content-Type':'application/json',Cookie:'recruitment_session=test-session'},body:JSON.stringify({code:'code',state:'a'.repeat(64)})});assert.equal(response.status,400);assert.equal(exchanges,0);assert.equal(transactionStarted,false);
});
