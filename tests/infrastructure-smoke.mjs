import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {randomUUID,randomBytes} from 'node:crypto';
import {DeleteObjectCommand,GetObjectCommand} from '@aws-sdk/client-s3';
import {pool,s3,bucket} from '../server/infrastructure.js';
import {hashPassword} from '../server/auth.js';
import {readState} from '../server/database.js';
import {roundsFromTemplate} from '../src/model.js';
import {textPDF} from './text-pdf-fixture.js';
const origin=process.env.SMOKE_ORIGIN||'http://127.0.0.1:3001';
const tag=randomBytes(5).toString('hex'),password=randomBytes(24).toString('hex');
const ids={admin:randomUUID(),hr:randomUUID(),interviewer:randomUUID(),other:randomUUID(),candidate:randomUUID(),app:randomUUID(),template:randomUUID()};
let fileId;let passed=false;
async function api(path,{method='GET',cookie,body,status=200,headers={}}={}){const response=await fetch(origin+'/api'+path,{method,headers:{...(cookie?{Cookie:cookie}:{}),...(body&&!Buffer.isBuffer(body)?{'Content-Type':'application/json'}:{}),...headers},body:body?(Buffer.isBuffer(body)?body:JSON.stringify(body)):undefined});const value=await response.json();assert.equal(response.status,status,`Unexpected HTTP status for ${method} ${path}: ${value.error||response.status}`);return {value,cookie:response.headers.get('set-cookie')?.split(';')[0]};}
try{
 const hash=await hashPassword(password);
 for(const [key,role] of [['admin','admin'],['hr','HR']])await pool.execute('INSERT INTO recruitment_users(id,username,name,role,password_hash) VALUES(?,?,?,?,?)',[ids[key],`smoke_${key}_${tag}`,`联调${key}_${tag}`,role,hash]);
 await api('/state',{status:401});
 const admin=(await api('/login',{method:'POST',body:{username:`smoke_admin_${tag}`,password}})).cookie;
 const hr=(await api('/login',{method:'POST',body:{username:`smoke_hr_${tag}`,password}})).cookie;
 for(const key of ['interviewer','other']){await api('/users',{method:'POST',cookie:admin,body:{username:`smoke_${key}_${tag}`,name:`联调${key}_${tag}`,role:'interviewer',password}});const [[created]]=await pool.execute('SELECT id FROM recruitment_users WHERE username=?',[`smoke_${key}_${tag}`]);ids[key]=created.id;}
 const interviewer=(await api('/login',{method:'POST',body:{username:`smoke_interviewer_${tag}`,password}})).cookie;
 const other=(await api('/login',{method:'POST',body:{username:`smoke_other_${tag}`,password}})).cookie;
 const get=async()=> (await api('/state',{cookie:hr})).value.data;
 const initial=await get();
 assert.ok(initial.users.every(u=>u.role==='interviewer'&&u.username===undefined));
 await api('/users',{method:'POST',cookie:hr,body:{username:'forbidden',name:'forbidden',role:'admin',password},status:403});
 await api('/users/'+ids.other+'/status',{method:'PATCH',cookie:hr,body:{frozen:true},status:403});
 await api('/users/'+ids.admin+'/status',{method:'PATCH',cookie:admin,body:{frozen:true},status:400});
 const sample=textPDF(['Name: Jane Chen','Phone: 13800138000','Email: jane@example.com']);
 await api('/resumes/parse?name=sample.pdf',{method:'POST',cookie:interviewer,body:sample,headers:{'Content-Type':'application/octet-stream'},status:403});
 const parsed=(await api('/resumes/parse?name=sample.pdf',{method:'POST',cookie:hr,body:sample,headers:{'Content-Type':'application/octet-stream'}})).value;
 assert.equal(parsed.fields.name,'Jane Chen');assert.equal(parsed.fields.phone,'13800138000');assert.deepEqual(await get(),initial);
 await api('/state',{method:'POST',cookie:hr,body:initial,status:403,headers:{Origin:'https://untrusted.example'}});
 await api('/resumes?name=fake.pdf',{method:'POST',cookie:hr,body:Buffer.from('fake'),headers:{'Content-Type':'application/octet-stream'},status:400});
 const pdf=await fs.readFile(new URL('./demo-resume.pdf',import.meta.url));
 const uploaded=await api('/resumes?name=integration-resume.pdf',{method:'POST',cookie:hr,body:pdf,headers:{'Content-Type':'application/octet-stream'},status:201});fileId=uploaded.value.id;
 const template={id:ids.template,name:`联调流程_${tag}`,nodes:[{name:'初试',interviewer:`联调interviewer_${tag}`},{name:'复试',interviewer:''}]};
 const application={id:ids.app,candidateId:ids.candidate,job:template.name,templateId:template.id,status:'进行中',screening:{status:'pending',interviewer:`联调interviewer_${tag}`,reason:''},reason:'',resume:uploaded.value,rounds:roundsFromTemplate(template),history:[]};
 const next=structuredClone(initial);next.templates.push(template);next.candidates.push({id:ids.candidate,name:`联调候选人_${tag}`,phone:'13800000000',email:'integration@example.com',education:'普本',notes:'仅 HR 可见'});next.applications.push(application);
 await api('/state',{method:'POST',cookie:hr,body:next});
 await api('/state',{method:'POST',cookie:hr,body:next,status:409});
 const pendingView=(await api('/state',{cookie:interviewer})).value.data;
 assert.equal(pendingView.applications[0].rounds.length,0);assert.equal(pendingView.applications[0].screening.status,'pending');assert.equal(pendingView.candidates[0].notes,undefined);
 await api('/resumes/'+fileId+'/url',{cookie:interviewer});await api('/resumes/'+fileId+'/url',{cookie:other,status:404});
 const screeningPath=`/applications/${ids.app}/screening`;
 await api(screeningPath,{method:'PATCH',cookie:other,body:{revision:pendingView.revision,decision:'accepted'},status:403});
 await api(screeningPath,{method:'PATCH',cookie:hr,body:{revision:pendingView.revision,decision:'accepted'},status:403});
 let unaccepted=await get();let unacceptedApp=unaccepted.applications.find(a=>a.id===ids.app);
 Object.assign(unacceptedApp.rounds[0],{time:'2026-10-20T10:00',location:'https://meeting.example.com/integration'});
 await api('/state',{method:'POST',cookie:hr,body:unaccepted,status:400});
 await api(screeningPath,{method:'PATCH',cookie:interviewer,body:{revision:pendingView.revision,decision:'declined',reason:'联调退回'}});
 assert.equal((await get()).applications.find(a=>a.id===ids.app).status,'未录用');
 await api('/resumes/'+fileId+'/url',{cookie:interviewer,status:404});
 let resend=await get();resend.applications.find(a=>a.id===ids.app).screening={status:'pending',interviewer:`联调interviewer_${tag}`};await api('/state',{method:'POST',cookie:hr,body:resend,status:400});
 const updatedResume=(await api('/resumes?name=updated-resume.pdf',{method:'POST',cookie:hr,body:pdf,headers:{'Content-Type':'application/octet-stream'},status:201})).value;
 const profileUpdate=await get();profileUpdate.candidates.find(c=>c.id===ids.candidate).resumes=[updatedResume];await api('/state',{method:'POST',cookie:hr,body:profileUpdate});
 const updatedProfile=await get();assert.equal(updatedProfile.candidates.find(c=>c.id===ids.candidate).resumes[0].id,updatedResume.id);assert.equal(updatedProfile.applications.find(a=>a.id===ids.app).resume.id,fileId);
 await api('/resumes/'+updatedResume.id+'/url',{cookie:hr});await api('/resumes/'+updatedResume.id+'/url',{cookie:interviewer,status:404});
 ids.closedApp=ids.app;ids.app=randomUUID();application.id=ids.app;application.rounds=roundsFromTemplate(template);const recall=await get();recall.applications.push(application);await api('/state',{method:'POST',cookie:hr,body:recall});const recalledScreeningPath=`/applications/${ids.app}/screening`;
 const pendingAgain=(await api('/state',{cookie:interviewer})).value.data;
 await api(recalledScreeningPath,{method:'PATCH',cookie:interviewer,body:{revision:pendingAgain.revision,decision:'accepted'}});
 await api(recalledScreeningPath,{method:'PATCH',cookie:interviewer,body:{revision:pendingAgain.revision,decision:'accepted'},status:409});
 let accepted=await get();Object.assign(accepted.applications.find(a=>a.id===ids.app).rounds[0],{time:'2026-10-20T10:00',location:'https://meeting.example.com/integration',focus:'仅用于接口验证'});
 await api('/state',{method:'POST',cookie:hr,body:accepted});
 const stored=await readState(pool);assert.equal(stored.state.applications.find(a=>a.id===ids.app).resume.id,fileId);
 const duplicate=(await api('/state',{cookie:hr})).value.data;duplicate.applications.push({...application,id:randomUUID(),rounds:roundsFromTemplate(template)});await api('/state',{method:'POST',cookie:hr,body:duplicate,status:400});
 const [fileRows]=await pool.execute('SELECT object_key FROM recruitment_files WHERE id=?',[fileId]);const object=await s3.send(new GetObjectCommand({Bucket:bucket,Key:fileRows[0].object_key}));assert.deepEqual(Buffer.from(await object.Body.transformToByteArray()),pdf);
 const anonymous=await fetch(`${process.env.S3_ENDPOINT}/${bucket}/${fileRows[0].object_key}`);assert.ok([403,404].includes(anonymous.status),'Resume must not be public');
 const view=(await api('/state',{cookie:interviewer})).value.data;assert.equal(view.applications.length,1);assert.equal(view.applications[0].rounds.length,1);assert.equal(view.candidates[0].notes,undefined);
 assert.equal((await api('/state',{cookie:other})).value.data.applications.length,0);
 await api('/state',{method:'POST',cookie:interviewer,body:view,status:403});
 const forbidden=await fetch(origin+'/api/resumes/'+fileId+'/url',{headers:{Cookie:other}});assert.equal(forbidden.status,404);
 const native=await fetch(origin+'/api/resumes/'+fileId,{headers:{Cookie:interviewer},redirect:'manual',signal:AbortSignal.timeout(20000)});assert.equal(native.status,302);assert.equal(new URL(native.headers.get('location')).searchParams.get('X-Amz-Expires'),'300');
 const access=(await api('/resumes/'+fileId+'/url',{cookie:interviewer})).value;const signed=new URL(access.url);assert.equal(signed.searchParams.get('X-Amz-Expires'),'300');assert.equal(signed.searchParams.get('response-content-type'),'application/pdf');assert.ok(signed.searchParams.get('response-content-disposition').startsWith('inline'));const retrieved=await fetch(access.url);assert.equal(retrieved.status,200);assert.deepEqual(Buffer.from(await retrieved.arrayBuffer()),pdf);
 const roundId=application.rounds[0].id;const feedbackPath=`/applications/${ids.app}/rounds/${roundId}/feedback`;
 const transcriptPath=`/applications/${ids.app}/rounds/${roundId}/transcript?name=conversation.txt`,conversation=Buffer.from('Interviewer: Tell me about your project.\nCandidate: This is a synthetic integration test.');
 await api(transcriptPath,{method:'POST',cookie:hr,body:conversation,headers:{'Content-Type':'application/octet-stream'},status:403});
 await api(transcriptPath,{method:'POST',cookie:other,body:conversation,headers:{'Content-Type':'application/octet-stream'},status:403});
 const transcript=(await api(transcriptPath,{method:'POST',cookie:interviewer,body:conversation,headers:{'Content-Type':'application/octet-stream'},status:201})).value;
 await api('/mcp-token',{cookie:hr,status:403});
 const mcpToken=(await api('/mcp-token',{method:'POST',cookie:interviewer,body:{canWrite:true}})).value.token;
 const otherToken=(await api('/mcp-token',{method:'POST',cookie:other})).value.token;
 const {Client}=await import('@modelcontextprotocol/sdk/client/index.js');const {StreamableHTTPClientTransport}=await import('@modelcontextprotocol/sdk/client/streamableHttp.js');
 const connectMcp=async token=>{const client=new Client({name:'smoke-test',version:'1.0.0'});await client.connect(new StreamableHTTPClientTransport(new URL(origin+'/mcp'),{requestInit:{headers:{Authorization:'Bearer '+token}}}));return client;};
 assert.equal((await fetch(origin+'/mcp',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,401);
 const mcp=await connectMcp(mcpToken),otherMcp=await connectMcp(otherToken);
 try{
  assert.equal((await mcp.listTools()).tools.length,5);assert.equal((await otherMcp.listTools()).tools.length,3);
  const read=async(client,name,args)=>client.callTool({name,arguments:args});
  assert.equal(JSON.parse((await read(mcp,'list_my_interviews',{})).content[0].text).total,1);
  assert.equal(JSON.parse((await read(otherMcp,'list_my_interviews',{})).content[0].text).total,0);
  assert.equal((await read(otherMcp,'get_my_interview',{applicationId:ids.app})).isError,true);
  assert.equal((await read(otherMcp,'get_interview_file',{applicationId:ids.app,kind:'resume'})).isError,true);
 }finally{await mcp.close();await otherMcp.close();}
 const writeMcp=await connectMcp(mcpToken);
 try{
  const uploaded=await writeMcp.callTool({name:'upload_my_transcript',arguments:{applicationId:ids.app,roundId,name:'conversation.txt',contentBase64:conversation.toString('base64'),confirmed:true}});assert.notEqual(uploaded.isError,true);Object.assign(transcript,JSON.parse(uploaded.content[0].text));
  const denied=await writeMcp.callTool({name:'save_my_feedback_draft',arguments:{applicationId:ids.app,roundId,revision:view.revision,summary:'MCP 联调草稿',conclusion:'建议不通过',confirmed:false}});assert.equal(denied.isError,true);
  const saved=await writeMcp.callTool({name:'save_my_feedback_draft',arguments:{applicationId:ids.app,roundId,revision:view.revision,summary:'MCP 联调草稿',conclusion:'建议不通过',transcriptId:transcript.id,confirmed:true}});assert.notEqual(saved.isError,true);view.revision=JSON.parse(saved.content[0].text).revision;
  const hrAfter=await get();assert.equal(hrAfter.applications.find(a=>a.id===ids.app).status,'进行中');assert.equal(hrAfter.applications.find(a=>a.id===ids.app).rounds[0].feedback.summary,undefined);
 }finally{await writeMcp.close();}
 await api(feedbackPath,{method:'PATCH',cookie:interviewer,body:{revision:view.revision,draft:true,feedback:{summary:'联调草稿',transcript:{id:'not-this-round'}}},status:400});

 await api(feedbackPath,{method:'PATCH',cookie:other,body:{revision:view.revision},status:403});
 await api(feedbackPath,{method:'PATCH',cookie:interviewer,body:{revision:view.revision,draft:true,feedback:{summary:'联调草稿',strengths:'',concerns:'',conclusion:'',transcript}}});
 let hrState=await get();assert.equal(hrState.applications.find(a=>a.id===ids.app).rounds[0].feedback.summary,undefined);
 assert.equal(hrState.applications.find(a=>a.id===ids.app).rounds[0].feedback.transcript,undefined);
 assert.equal((await fetch(origin+'/api/transcripts/'+transcript.id,{headers:{Cookie:hr},redirect:'manual'})).status,404);
 assert.equal((await fetch(origin+'/api/transcripts/'+transcript.id,{headers:{Cookie:other},redirect:'manual'})).status,404);
 assert.equal((await fetch(origin+'/api/transcripts/'+transcript.id,{headers:{Cookie:interviewer},redirect:'manual'})).status,302);
 const transcriptMcp=await connectMcp(mcpToken);
 try{const access=JSON.parse((await transcriptMcp.callTool({name:'get_interview_file',arguments:{applicationId:ids.app,kind:'transcript',roundId}})).content[0].text);const downloaded=await fetch(access.url);assert.equal(downloaded.status,200);assert.equal(await downloaded.text(),conversation.toString());}finally{await transcriptMcp.close();}
 const freshToken=(await api('/mcp-token',{method:'POST',cookie:other})).value.token;
 const tokenRequest=token=>fetch(origin+'/mcp',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:'{}'});
 assert.equal((await tokenRequest(otherToken)).status,401);
 await pool.execute('UPDATE recruitment_mcp_tokens SET expires_at=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 1 SECOND) WHERE user_id=?',[ids.other]);assert.equal((await tokenRequest(freshToken)).status,401);
 await api('/mcp-token',{method:'POST',cookie:other});await api('/mcp-token',{method:'DELETE',cookie:other});assert.equal((await api('/mcp-token',{cookie:other})).value.token,null);

 hrState.candidates.find(c=>c.id===ids.candidate).city='联调城市';await api('/state',{method:'POST',cookie:hr,body:hrState});
 let own=(await api('/state',{cookie:interviewer})).value.data;assert.equal(own.applications[0].rounds[0].feedback.summary,'联调草稿');
 await api(feedbackPath,{method:'PATCH',cookie:interviewer,body:{revision:own.revision,completed:false,feedback:{summary:'联调正式面评',conclusion:'建议通过'}},status:400});
 await api(feedbackPath,{method:'PATCH',cookie:interviewer,body:{revision:own.revision,completed:true,feedback:{summary:'联调正式面评',conclusion:'建议通过'}}});
 hrState=await get();let a=hrState.applications.find(a=>a.id===ids.app);assert.equal(a.status,'进行中');assert.equal(a.rounds[0].feedback.summary,'联调正式面评');
 assert.equal(a.rounds[0].feedback.transcript.id,transcript.id);assert.equal((await fetch(origin+'/api/transcripts/'+transcript.id,{headers:{Cookie:hr},redirect:'manual'})).status,302);
 a.rounds[0].feedback={...a.rounds[0].feedback,status:'returned',returnReason:'联调退回'};await api('/state',{method:'POST',cookie:hr,body:hrState});
 hrState=await get();a=hrState.applications.find(a=>a.id===ids.app);assert.equal(a.rounds[0].feedbackVersions.length,1);const beforeFailure=(await api('/state',{cookie:interviewer})).value.data;await api(feedbackPath,{method:'PATCH',cookie:interviewer,body:{revision:beforeFailure.revision,completed:true,feedback:{summary:'本轮不通过',conclusion:'建议不通过'}}});hrState=await get();a=hrState.applications.find(a=>a.id===ids.app);assert.equal(a.status,'未录用');assert.match(a.reason,/初试不通过/);assert.equal(a.rounds[1].cancelled,true);assert.equal(hrState.applications.find(a=>a.id===ids.closedApp).status,'未录用');
 const freezeToken=(await api('/mcp-token',{method:'POST',cookie:other})).value.token;
 await api('/users/'+ids.other+'/status',{method:'PATCH',cookie:admin,body:{frozen:true}});await api('/state',{cookie:other,status:401});await api('/login',{method:'POST',body:{username:`smoke_other_${tag}`,password},status:403});assert.equal((await tokenRequest(freezeToken)).status,401);
 await api('/users/'+ids.other+'/status',{method:'PATCH',cookie:admin,body:{frozen:false}});await api('/state',{cookie:other,status:401});assert.equal((await tokenRequest(freezeToken)).status,401);await api('/login',{method:'POST',body:{username:`smoke_other_${tag}`,password}});
 const newPassword=randomBytes(24).toString('hex');await api('/password',{method:'POST',cookie:interviewer,body:{currentPassword:password,password:newPassword}});await api('/state',{cookie:interviewer,status:401});assert.equal((await tokenRequest(mcpToken)).status,401);const renewed=(await api('/login',{method:'POST',body:{username:`smoke_interviewer_${tag}`,password:newPassword}})).cookie;await api('/logout',{method:'POST',cookie:renewed});await api('/state',{cookie:renewed,status:401});
 passed=true;console.log('PASS: scoped read/write MCP, confirmed draft saves and transcript uploads, token rotation/expiry/revocation, transcript upload/privacy/locking and first-round screening, decline/terminate/recall/accept and failed-feedback termination, pre-schedule private resume access, scheduling guard, MySQL persistence, private S3 upload/read, login, administrator/HR/interviewer separation, freezing and credential revocation, concurrency conflict, feedback draft/submit/return and final outcome.');
}finally{
 // Remove only records and objects created by this isolated smoke run.
 const [files]=await pool.execute('SELECT id,object_key FROM recruitment_files WHERE owner_id IN (?,?,?)',[ids.hr,ids.interviewer,ids.other]);
 for(const file of files)await s3.send(new DeleteObjectCommand({Bucket:bucket,Key:file.object_key}));
 const conn=await pool.getConnection();try{await conn.beginTransaction();const {state}=await readState(conn,true);state.candidates=state.candidates.filter(c=>c.id!==ids.candidate);state.applications=state.applications.filter(a=>a.id!==ids.app&&a.id!==ids.closedApp);state.templates=state.templates.filter(t=>t.id!==ids.template);await conn.execute('UPDATE recruitment_state SET payload=?,revision=revision+1 WHERE id=1',[JSON.stringify(state)]);await conn.execute('DELETE FROM recruitment_files WHERE owner_id IN (?,?,?)',[ids.hr,ids.interviewer,ids.other]);for(const key of ['admin','hr','interviewer','other']){await conn.execute('DELETE FROM recruitment_audit WHERE actor_id=?',[ids[key]]);await conn.execute('DELETE FROM recruitment_users WHERE id=?',[ids[key]]);}await conn.commit();}catch(error){await conn.rollback();throw error;}finally{conn.release();await pool.end();s3.destroy();}
 console.log('Cleanup complete: transient integration records, accounts and resume objects removed.');
}
if(!passed)process.exitCode=1;
