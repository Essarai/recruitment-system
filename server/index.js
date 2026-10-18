import {mountInterviewMcp,mountMcpTokenManagement} from './mcp.js';
import {validateTranscript,canUploadTranscript,canReadTranscript,transcriptReference} from './transcripts.js';
import {parseResume} from './resume-parser.js';
import {canAccessResume,decideScreening} from './screening.js';
import express from 'express';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {DeleteObjectCommand} from '@aws-sdk/client-s3';
import {pool,s3,bucket,initializeStorage} from './infrastructure.js';
import {initializeDatabase,readState,users,visibleState} from './database.js';
import {hashPassword,verifyPassword,tokenHash,sessionToken,getSessionCookie,setSessionCookie} from './auth.js';
import {validateHRState,text} from './validation.js';
import {MAX_FILE,validateResume,signedResumeAccess,storePrivateFile} from './files.js';
import {submitFeedback} from '../src/model.js';
const app=express();app.disable('x-powered-by');if(process.env.NODE_ENV==='production')app.set('trust proxy',1);
app.use((req,res,next)=>{
 res.set('X-Content-Type-Options','nosniff');if(req.path.startsWith('/api'))res.set('Cache-Control','no-store');
 if(!['GET','HEAD','OPTIONS'].includes(req.method)&&req.headers.origin){const expected=process.env.PUBLIC_ORIGIN||`${req.protocol}://${req.headers.host}`;if(req.headers.origin!==expected)return res.status(403).json({error:'请求来源不匹配'});}
 next();
});
app.get('/healthz',(req,res)=>res.set('Cache-Control','no-store').json({ok:true}));
mountInterviewMcp(app,{pool,s3,bucket});
const attempts=new Map();
app.post('/api/login',express.json({limit:'4kb'}),async(req,res)=>{
 const key=req.ip;const entry=attempts.get(key);if(entry&&entry.until>Date.now()&&entry.count>=10)return res.status(429).json({error:'尝试过于频繁，请 15 分钟后再试'});
 const {username,password}=req.body||{};
 if(typeof username!=='string'||username.length>80||typeof password!=='string'||password.length>128)return res.status(400).json({error:'请输入有效的账号密码'});
 const [[user]]=await pool.execute('SELECT * FROM recruitment_users WHERE username=?',[username]);
 const valid=await verifyPassword(password,user?.password_hash||'0123456789abcdef0123456789abcdef:'.concat('00'.repeat(64)));
 if(!user||!valid){attempts.set(key,{count:entry&&entry.until>Date.now()?entry.count+1:1,until:Date.now()+15*60*1000});return res.status(401).json({error:'账号或密码不正确'});}
 attempts.delete(key);const token=sessionToken();await pool.execute('INSERT INTO recruitment_sessions(token_hash,user_id,expires_at) VALUES(?,?,DATE_ADD(UTC_TIMESTAMP(),INTERVAL 8 HOUR))',[tokenHash(token),user.id]);setSessionCookie(res,token);res.json({user:{id:user.id,username:user.username,name:user.name,role:user.role}});
});
app.use('/api',async(req,res,next)=>{
 const token=getSessionCookie(req);if(!/^[a-f0-9]{64}$/.test(token))return res.status(401).json({error:'请先登录'});
 const [[user]]=await pool.execute('SELECT u.id,u.username,u.name,u.role FROM recruitment_sessions s JOIN recruitment_users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>UTC_TIMESTAMP()',[tokenHash(token)]);
 if(!user)return res.status(401).json({error:'登录已过期，请重新登录'});req.user=user;next();
});
mountMcpTokenManagement(app,{pool,newToken:sessionToken});
function hr(req,res,next){if(req.user.role!=='HR')return res.status(403).json({error:'仅 HR 可以执行此操作'});next();}
app.post('/api/logout',async(req,res)=>{await pool.execute('DELETE FROM recruitment_sessions WHERE token_hash=?',[tokenHash(getSessionCookie(req))]);res.clearCookie('recruitment_session',{path:'/api'});res.json({ok:true});});
app.post('/api/password',express.json({limit:'4kb'}),async(req,res)=>{
 const [[row]]=await pool.execute('SELECT password_hash FROM recruitment_users WHERE id=?',[req.user.id]);if(!await verifyPassword(req.body.currentPassword,row.password_hash))return res.status(400).json({error:'当前密码不正确'});
 const hash=await hashPassword(req.body.password);const conn=await pool.getConnection();try{await conn.beginTransaction();await conn.execute('UPDATE recruitment_users SET password_hash=? WHERE id=?',[hash,req.user.id]);await conn.execute('DELETE FROM recruitment_sessions WHERE user_id=?',[req.user.id]);await conn.execute('DELETE FROM recruitment_mcp_tokens WHERE user_id=?',[req.user.id]);await conn.commit();}catch(error){await conn.rollback();throw error;}finally{conn.release();}res.clearCookie('recruitment_session',{path:'/api'});res.json({ok:true});
});
app.get('/api/state',async(req,res)=>{const {state,revision}=await readState(pool);res.json({user:req.user,data:visibleState(state,req.user,await users(pool),revision)});});
app.post('/api/users',hr,express.json({limit:'8kb'}),async(req,res)=>{
 const username=text(req.body.username,'登录账号',80,true),name=text(req.body.name,'姓名',100,true),role=req.body.role;
 if(!/^[a-zA-Z0-9._-]{3,80}$/.test(username)||!['HR','interviewer'].includes(role))return res.status(400).json({error:'账号须为 3 至 80 位字母、数字或 ._-，请选择角色'});
 const hash=await hashPassword(req.body.password);try{await pool.execute('INSERT INTO recruitment_users(id,username,name,role,password_hash) VALUES(?,?,?,?,?)',[randomUUID(),username,name,role,hash]);}catch(error){if(error.code==='ER_DUP_ENTRY')return res.status(409).json({error:'账号或姓名已存在，请使用唯一名称'});throw error;}res.json({ok:true});
});
app.post('/api/state',hr,express.json({limit:'8mb'}),async(req,res)=>{
 const conn=await pool.getConnection();try{
  await conn.beginTransaction();const {state:previous,revision}=await readState(conn,true);
  if(req.body.revision!==revision){await conn.rollback();return res.status(409).json({error:'数据已被他人更新，请刷新页面后重试；本次修改尚未保存'});}
  // Fetch both validation lists in one round trip on the transaction connection.
  const [context]=await conn.query(`SELECT 'user' AS kind,id,username,name,role,NULL AS mime,NULL AS size FROM recruitment_users
   UNION ALL SELECT 'file',id,NULL,name,NULL,mime,size FROM recruitment_files`);
  const userList=context.filter(row=>row.kind==='user').map(({id,username,name,role})=>({id,username,name,role}));
  const files=context.filter(row=>row.kind==='file');
  const state=validateHRState(previous,req.body,userList.filter(u=>u.role==='interviewer').map(u=>u.name),files,req.user.name);
  await conn.execute('UPDATE recruitment_state SET revision=revision+1,payload=? WHERE id=1',[JSON.stringify(state)]);
  await conn.execute('INSERT INTO recruitment_audit(actor_id,action,target_id) VALUES(?,?,?)',[req.user.id,'更新招聘数据','state']);await conn.commit();res.json(visibleState(state,req.user,userList,revision+1));
 }catch(error){await conn.rollback();throw error;}finally{conn.release();}
});
app.patch('/api/applications/:appId/screening',express.json({limit:'8kb'}),async(req,res)=>{
 const conn=await pool.getConnection();try{
  await conn.beginTransaction();const {state,revision}=await readState(conn,true);
  if(req.body.revision!==revision){await conn.rollback();return res.status(409).json({error:'数据已更新，请刷新后重新确认'});}
  const app=state.applications.find(a=>a.id===req.params.appId);
  if(!app||req.user.role!=='interviewer'||app.screening?.interviewer!==req.user.name){await conn.rollback();return res.status(403).json({error:'无权确认此简历'});}
  app.screening=decideScreening(app,req.user,req.body.decision,req.body.reason||'');
  app.history.unshift({at:new Date().toISOString(),actor:req.user.name,action:app.screening.status==='accepted'?'接受首轮面试':`简历退回 HR：${app.screening.reason}`});
  await conn.execute('UPDATE recruitment_state SET revision=revision+1,payload=? WHERE id=1',[JSON.stringify(state)]);
  await conn.execute('INSERT INTO recruitment_audit(actor_id,action,target_id) VALUES(?,?,?)',[req.user.id,'确认推荐简历',app.id]);await conn.commit();
  res.json(visibleState(state,req.user,await users(pool),revision+1));
 }catch(error){await conn.rollback();throw error;}finally{conn.release();}
});
app.patch('/api/applications/:appId/rounds/:roundId/feedback',express.json({limit:'32kb'}),async(req,res)=>{
 const conn=await pool.getConnection();try{
  await conn.beginTransaction();const {state,revision}=await readState(conn,true);
  if(req.body.revision!==revision){await conn.rollback();return res.status(409).json({error:'数据已更新，请刷新后重新填写'});}
  const a=state.applications.find(a=>a.id===req.params.appId),r=a?.rounds.find(r=>r.id===req.params.roundId);
  if(!r||r.interviewer!==req.user.name||req.user.role!=='interviewer'||!r.time||r.cancelled){await conn.rollback();return res.status(403).json({error:'无权修改此面评'});}
  if(r.feedback.status==='submitted')throw Error('面评已提交，请先由 HR 退回');
  const input=req.body.feedback||{},f={summary:text(input.summary,'综合评价',10000),strengths:text(input.strengths,'优势',5000),concerns:text(input.concerns,'待验证事项',5000),conclusion:text(input.conclusion,'建议结论',20)};
  const transcript=await transcriptReference(conn,input.transcript,r.feedback.transcript,a.id,r.id,req.user);if(transcript)f.transcript=transcript;
  if(req.body.draft)r.feedback={...f,status:r.feedback.status==='returned'?'returned':'draft',author:req.user.name,returnReason:r.feedback.returnReason||''};
  else r.feedback=submitFeedback(a,r,req.user.name,f,req.body.completed===true);
  a.history.unshift({at:new Date().toISOString(),actor:req.user.name,action:req.body.draft?'保存面评草稿':'提交面评'});
  await conn.execute('UPDATE recruitment_state SET revision=revision+1,payload=? WHERE id=1',[JSON.stringify(state)]);await conn.execute('INSERT INTO recruitment_audit(actor_id,action,target_id) VALUES(?,?,?)',[req.user.id,req.body.draft?'保存面评草稿':'提交面评',r.id]);await conn.commit();res.json(visibleState(state,req.user,await users(pool),revision+1));
 }catch(error){await conn.rollback();throw error;}finally{conn.release();}
});
app.post('/api/resumes/parse',hr,express.raw({type:'application/octet-stream',limit:MAX_FILE}),async(req,res)=>{
 const name=text(req.query.name,'文件名',240,true);res.json(await parseResume(name,req.body));
});
app.post('/api/resumes',hr,express.raw({type:'application/octet-stream',limit:MAX_FILE}),async(req,res)=>{
 const name=text(req.query.name,'文件名',240,true);res.status(201).json(await storePrivateFile(pool,s3,bucket,req.user.id,name,req.body,validateResume(name,req.body),'resumes'));
});
app.post('/api/applications/:appId/rounds/:roundId/transcript',express.raw({type:'application/octet-stream',limit:MAX_FILE}),async(req,res)=>{
 const {state}=await readState(pool),a=state.applications.find(a=>a.id===req.params.appId),r=a?.rounds.find(r=>r.id===req.params.roundId);
 if(!canUploadTranscript(a,r,req.user))return res.status(403).json({error:'仅本轮面试官可以在未锁定的面评中上传对话'});
 const name=text(req.query.name,'文件名',240,true),format=validateTranscript(name,req.body);
 const file=await storePrivateFile(pool,s3,bucket,req.user.id,name,req.body,format,'transcripts');
 try{await pool.execute('INSERT INTO recruitment_transcripts(file_id,application_id,round_id) VALUES(?,?,?)',[file.id,a.id,r.id]);}
 catch(error){const [[stored]]=await pool.execute('SELECT object_key FROM recruitment_files WHERE id=?',[file.id]);try{await s3.send(new DeleteObjectCommand({Bucket:bucket,Key:stored.object_key}));await pool.execute('DELETE FROM recruitment_files WHERE id=?',[file.id]);}catch{console.error('Failed to clean an unlinked transcript',file.id);}throw error;}
 res.status(201).json(file);
});
app.get('/api/transcripts/:id',async(req,res)=>{
 const {state}=await readState(pool);if(!canReadTranscript(state,req.params.id,req.user))return res.status(404).json({error:'对话附件不存在或无权访问'});
 const [[file]]=await pool.execute('SELECT * FROM recruitment_files WHERE id=?',[req.params.id]);if(!file)return res.status(404).json({error:'对话附件不存在'});
 const {url}=await signedResumeAccess(s3,bucket,file);res.set('Referrer-Policy','no-referrer');res.redirect(302,url);
});

async function authorizeResume(req,res,next){
 const {state}=await readState(pool);const allowed=state.applications.some(a=>a.resume?.id===req.params.id&&canAccessResume(a,req.user));
 if(!allowed)return res.status(404).json({error:'简历不存在或无权访问'});
 const [[file]]=await pool.execute('SELECT * FROM recruitment_files WHERE id=?',[req.params.id]);if(!file)return res.status(404).json({error:'简历不存在'});req.resumeFile=file;next();
}
app.get('/api/resumes/:id/url',authorizeResume,async(req,res)=>res.json(await signedResumeAccess(s3,bucket,req.resumeFile)));
app.get('/api/resumes/:id',authorizeResume,async(req,res)=>{const {url}=await signedResumeAccess(s3,bucket,req.resumeFile);res.set('Referrer-Policy','no-referrer');res.redirect(302,url);});

app.use('/api',(req,res)=>res.status(404).json({error:'接口不存在'}));
const dist=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../dist/client');app.use(express.static(dist,{index:false}));app.get('/{*path}',(req,res)=>res.sendFile(path.join(dist,'index.html')));
app.use((error,req,res,next)=>{
 if(res.headersSent)return next(error);
 if(error.type==='entity.too.large')return res.status(413).json({error:'请求内容过大，简历不超过 20 MB'});
 const infrastructure=error.code||error.$metadata;const status=infrastructure?503:400;
 console.error('Request failed',{path:req.path,type:error.name,code:error.code||error.$metadata?.httpStatusCode});res.status(status).json({error:infrastructure?'数据库或文件存储暂时不可用，请稍后重试':error.message||'请求失败'});
});
await initializeDatabase(pool);await initializeStorage();
const server=app.listen(Number(process.env.PORT||process.env.API_PORT||3001),process.env.API_HOST||(process.env.NODE_ENV==='production'?'0.0.0.0':'127.0.0.1'),()=>console.log('Recruitment API ready; MySQL and private S3 bucket connected.'));
const cleanup=setInterval(()=>{for(const [key,value] of attempts)if(value.until<Date.now())attempts.delete(key);pool.query('DELETE FROM recruitment_sessions WHERE expires_at<UTC_TIMESTAMP()').catch(()=>{});},15*60*1000);cleanup.unref();
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{clearInterval(cleanup);server.close(async()=>{await pool.end();s3.destroy();process.exit(0);});});
