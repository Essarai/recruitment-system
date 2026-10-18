import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {createInterviewMcp,myInterviews,interviewFile} from '../server/mcp.js';
import {validateTranscript,canUploadTranscript,canReadTranscript,transcriptReference} from '../server/transcripts.js';
import {visibleState} from '../server/database.js';
import {seed} from './fixtures.js';
const user={id:'interviewer-one',name:'陈晨',role:'interviewer'};
function fixture(){const state=seed(),app=state.applications[0];app.resume={id:'resume',name:'resume.pdf'};app.rounds[0].feedback={status:'draft',summary:'我的草稿',transcript:{id:'mine',name:'conversation.txt'}};app.rounds[1].feedback={status:'submitted',summary:'其他面试官面评',transcript:{id:'other-file',name:'other.txt'}};state.candidates[0].notes='HR 私有备注';return state;}

test('对话格式校验拒绝二进制、非法编码、空文件和伪装 PDF',()=>{
 for(const name of ['talk.txt','talk.md'])assert.match(validateTranscript(name,Buffer.from('面试官：你好\n候选人：你好')).type,/text\//);
 for(const [name,body] of [['talk.txt',Buffer.from([0xff])],['talk.txt',Buffer.from('a\0b')],['talk.txt',Buffer.from(' ')],['../talk.txt',Buffer.from('text')],['talk.pdf',Buffer.from('not PDF')],['talk.exe',Buffer.from('binary')]])assert.throws(()=>validateTranscript(name,body));
 assert.equal(validateTranscript('talk.pdf',Buffer.from('%PDF-1.4\n')).extension,'pdf');
});
test('对话权限随本人轮次和正式面评控制，HR 看不到草稿附件，历史正式附件仍可读',()=>{
 const state=fixture(),app=state.applications[0],r=app.rounds[0],hr={role:'HR'};
 assert.ok(canUploadTranscript(app,r,user));assert.equal(canUploadTranscript(app,r,{...user,name:'周宁'}),false);
 assert.ok(canReadTranscript(state,'mine',user));assert.equal(canReadTranscript(state,'other-file',user),false);assert.equal(canReadTranscript(state,'mine',hr),false);
 assert.equal(visibleState(state,hr,[],1).applications[0].rounds[0].feedback.transcript,undefined);
 r.feedback.status='submitted';assert.equal(canUploadTranscript(app,r,user),false);assert.ok(canReadTranscript(state,'mine',hr));
 r.feedbackVersions=[structuredClone(r.feedback)];r.feedback={status:'returned',transcript:{id:'replacement'}};
 assert.ok(canReadTranscript(state,'mine',hr));assert.equal(canReadTranscript(state,'replacement',hr),false);
 r.cancelled=true;assert.equal(canUploadTranscript(app,r,user),false);
});
test('附件引用校验绑定当前面试官、应聘和轮次，拒绝客户端伪造名称或其他轮次文件',async()=>{
 const file={id:'mine',name:'stored.txt',mime:'text/plain',size:123};let parameters;
 const db={execute:async(sql,args)=>{parameters=args;return [[args[0]==='mine'?file:undefined].filter(Boolean)];}};
 assert.deepEqual(await transcriptReference(db,{id:'mine',name:'forged.txt'},null,'app','round',user),{id:'mine',name:'stored.txt',type:'text/plain',size:123});
 assert.deepEqual(parameters,['mine',user.id,'app','round']);
 await assert.rejects(transcriptReference(db,{id:'other'},null,'app','round',user),/不属于/);
 assert.equal(await transcriptReference(db,null,file,'app','round',user),undefined);
});
test('真实 MCP 协议仅注册三个只读工具，分页及详情不泄露他人面评、HR 备注和文件',async()=>{
 const state=fixture(),view=myInterviews(state,user),app=view.applications.find(a=>a.id==='a0');
 assert.equal(app.rounds.length,1);assert.equal(view.candidates[0].notes,undefined);assert.throws(()=>myInterviews(state,{role:'HR'}));
 assert.throws(()=>interviewFile(view,'a0','transcript',state.applications[0].rounds[1].id));
 const server=createInterviewMcp({user,loadState:async()=>state,fileAccess:async file=>({name:file.name,url:'https://files.example.com/temporary',expiresAt:'soon'})});
 const client=new Client({name:'test-client',version:'1.0.0'}),[clientTransport,serverTransport]=InMemoryTransport.createLinkedPair();
 try{
  await server.connect(serverTransport);await client.connect(clientTransport);
  const tools=(await client.listTools()).tools;assert.deepEqual(tools.map(t=>t.name).sort(),['get_interview_file','get_my_interview','list_my_interviews']);assert.ok(tools.every(t=>t.annotations.readOnlyHint));
  const list=JSON.parse((await client.callTool({name:'list_my_interviews',arguments:{limit:1}})).content[0].text);assert.equal(list.items.length,1);assert.ok(list.total>1);
  const details=JSON.parse((await client.callTool({name:'get_my_interview',arguments:{applicationId:'a0'}})).content[0].text);assert.equal(details.application.rounds.length,1);assert.equal(details.candidate.notes,undefined);assert.ok(!JSON.stringify(details).includes('其他面试官面评'));
  const denied=await client.callTool({name:'get_interview_file',arguments:{applicationId:'a0',kind:'transcript',roundId:state.applications[0].rounds[1].id}});assert.equal(denied.isError,true);
  const file=JSON.parse((await client.callTool({name:'get_interview_file',arguments:{applicationId:'a0',kind:'transcript',roundId:state.applications[0].rounds[0].id}})).content[0].text);assert.equal(file.name,'conversation.txt');
  assert.equal((await client.callTool({name:'get_my_interview',arguments:{applicationId:'a7'}})).isError,true);
 }finally{await client.close();await server.close();}
});

test('写入工具要求专用权限、本轮有效安排及逐次确认；仅保存草稿，拒绝他人和正式面评',async()=>{
 const state=fixture();state.revision=12;let writes=0,uploads=0;
 const server=createInterviewMcp({user:{...user,canWrite:true},loadState:async()=>state,fileAccess:async()=>({}),saveDraft:async(appId,roundId,body)=>{writes++;assert.equal(body.draft,true);assert.equal(body.revision,12);assert.equal(body.feedback.summary,'已确认内容');return {revision:13};},uploadTranscript:async(appId,roundId,name,buffer)=>{uploads++;assert.equal(buffer.toString(),'完整对话');return {id:'uploaded',name};}});
 const client=new Client({name:'write-test',version:'1'}),[ct,st]=InMemoryTransport.createLinkedPair();
 try{
  await server.connect(st);await client.connect(ct);assert.equal((await client.listTools()).tools.length,5);
  const base={applicationId:'a0',roundId:state.applications[0].rounds[0].id,revision:12,summary:'已确认内容',conclusion:'建议不通过'};
  assert.equal((await client.callTool({name:'save_my_feedback_draft',arguments:{...base,confirmed:false}})).isError,true);assert.equal(writes,0);
  const saved=await client.callTool({name:'save_my_feedback_draft',arguments:{...base,confirmed:true}});assert.equal(saved.isError,undefined);assert.equal(writes,1);assert.equal(state.applications[0].status,'进行中');
  assert.equal((await client.callTool({name:'save_my_feedback_draft',arguments:{...base,roundId:state.applications[0].rounds[1].id,confirmed:true}})).isError,true);
  const file={applicationId:'a0',roundId:base.roundId,name:'dialogue.txt',contentBase64:Buffer.from('完整对话').toString('base64'),confirmed:true};
  assert.equal((await client.callTool({name:'upload_my_transcript',arguments:{...file,confirmed:false}})).isError,true);
  assert.equal((await client.callTool({name:'upload_my_transcript',arguments:{...file,contentBase64:'@@@@'}})).isError,true);
  assert.equal((await client.callTool({name:'upload_my_transcript',arguments:file})).isError,undefined);assert.equal(uploads,1);
  state.applications[0].rounds[0].feedback.status='submitted';assert.equal((await client.callTool({name:'save_my_feedback_draft',arguments:{...base,confirmed:true}})).isError,true);assert.equal(writes,1);
 }finally{await client.close();await server.close();}
});
