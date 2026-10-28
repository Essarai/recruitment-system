import {test} from 'node:test';
import assert from 'node:assert/strict';
import {decideScreening,canAccessResume} from '../server/screening.js';
import {decideRoundReview} from '../server/round-review.js';
import {supplementReview,saveReviewSupplement} from '../server/review-supplement.js';
import {visibleState} from '../server/database.js';
import {validateHRState} from '../server/validation.js';
import {myInterviews} from '../server/mcp.js';
import {round,validateSchedule,terminateFailedApplication,applicationStage} from '../src/model.js';
import {activateRoundReviews} from '../src/round-review.js';
import {canWithdrawApplication} from '../src/permissions.js';
import {interviewGroups} from '../src/interview-groups.js';
import {applicationWait} from '../src/application-wait.js';
import {feishuDesired} from '../server/feishu-model.js';
const hr={id:'hr',name:'HR甲',role:'HR'},otherHR={id:'other',name:'HR乙',role:'HR'},admin={id:'admin',name:'管理员',role:'admin'},first={id:'i1',name:'一面官',role:'interviewer'},second={id:'i2',name:'二面官',role:'interviewer'},third={id:'i3',name:'三面官',role:'interviewer'},people=[hr,otherHR,admin,first,second,third];
const file={id:'f',name:'简历.pdf',mime:'application/pdf',size:100},at='2026-10-28T01:00:00Z',later='2026-10-28T02:00:00Z';
const schedule={interviewer:first.name,time:'2026-11-01T14:00',mode:'线上',location:'https://example.com/meeting'};
function fixture(){return {candidates:[{id:'c',name:'测试候选人',phone:'13800138000',email:'qa@example.com',age:'28',highestEducation:'本科',education:'普本',experience:'3',company:'测试公司',currentTitle:'产品经理',city:'杭州',notes:'HR 前置沟通记录：已电话核实求职意向、到岗时间和项目职责，建议进入业务面试。',resumes:[{id:file.id,name:file.name,type:file.mime,size:100}]}],templates:[],applications:[{id:'a',createdBy:hr.id,candidateId:'c',job:'产品经理',status:'进行中',reason:'',resume:{id:file.id,name:file.name,type:file.mime,size:100},screening:{status:'pending',interviewer:first.name,sentAt:at},rounds:[{...round('初试'),id:'r1',interviewer:first.name},{...round('复试'),id:'r2',interviewer:second.name}],history:[{at,actor:hr.name,action:'创建应聘'}]}]};}
const needInitial=s=>{const a=s.applications[0];a.screening=decideScreening(a,first,'needs_info','请核实项目实际职责和最早到岗时间');return a;};
function laterReview(){const s=fixture(),a=s.applications[0];a.screening={status:'skipped',interviewer:''};Object.assign(a.rounds[0],{time:'2026-10-27T14:00',feedback:{status:'submitted',summary:'仅属于一面官的正式面评',conclusion:'建议通过',submittedAt:at}});activateRoundReviews(a,hr.name,at);return s;}
const cfg={backfill:true,bindings:{i1:'ou_1',i2:'ou_2',i3:'ou_3'},calendarId:'calendar'};
function fakePool(state,actor=hr){let writes=0,audits=0,rollback=0;const conn={beginTransaction:async()=>{},query:async sql=>{if(sql.includes('recruitment_state')){assert.match(sql,/FOR UPDATE/);return [[{revision:7,payload:structuredClone(state)}]];}return [people.map(p=>p.id===actor.id?actor:p)];},execute:async(sql,args)=>{if(sql.startsWith('UPDATE recruitment_state')){Object.assign(state,JSON.parse(args[0]));writes++;}else audits++;},commit:async()=>{},rollback:async()=>{rollback++;},release(){}};return {getConnection:async()=>conn,get writes(){return writes},get audits(){return audits},get rollback(){return rollback}};}
test('初始确认需补充必须写原因，不结束应聘，不解锁排期，不产生面试日程或面试官待办',()=>{
 const s=fixture(),a=s.applications[0];for(const reason of ['', '   ','x'.repeat(2001)])assert.throws(()=>decideScreening(a,first,'needs_info',reason),/原因/);
 needInitial(s);assert.equal(a.status,'进行中');assert.equal(terminateFailedApplication(a),false);assert.throws(()=>validateSchedule(a,a.rounds[0],schedule),/简历确认/);assert.equal(canWithdrawApplication(hr,a),false);assert.equal(applicationStage(a).name,'需 HR 补充');assert.ok(applicationWait(a,Date.parse(later)));
 const [group]=interviewGroups(visibleState(s,first,people,1),first.name);assert.equal(group.waitingInfo,true);assert.equal(group.tasks.length,0);assert.equal(feishuDesired(s,people,cfg).length,0);
});
test('HR 必须回复后重新送审，仍需本人确认通过；保留多次要求/回复且不能借重新送审撤回应聘',()=>{
 const s=fixture(),a=needInitial(s);const request=structuredClone(a.screening.supplements[0]);
 assert.throws(()=>supplementReview(a,null,hr,people,' '),/补充说明/);supplementReview(a,null,hr,people,'已核实：候选人独立负责需求规划，可两周内到岗。',later);
 assert.equal(a.screening.status,'pending');assert.equal(a.screening.sentAt,later);assert.equal(a.screening.supplements[0].reason,request.reason);assert.equal(a.screening.supplements[0].respondedBy,hr.name);assert.equal(canWithdrawApplication(hr,a),false);assert.throws(()=>validateSchedule(a,a.rounds[0],schedule),/简历确认/);
 const view=visibleState(s,first,people,8),[group]=interviewGroups(view,first.name);assert.equal(group.tasks[0].kind,'screening');assert.match(view.applications[0].screening.supplements[0].response,/已核实/);assert.equal(feishuDesired(s,people,cfg)[0].screeningAt,later);
 a.screening=decideScreening(a,first,'needs_info','请补充项目指标');assert.equal(a.screening.supplements.length,2);supplementReview(a,null,admin,people,'已核实项目指标及数据来源','2026-10-28T03:00:00Z');a.screening=decideScreening(a,first,'accepted');assert.doesNotThrow(()=>validateSchedule(a,a.rounds[0],schedule));assert.equal(a.screening.supplements.length,2);
});
test('后续轮次可需补充并再次确认，保留前轮面评与来源防护，飞书审核任务以新送审时间再次通知',()=>{
 const s=laterReview(),a=s.applications[0],r=a.rounds[1],old=structuredClone(a.rounds[0]);
 decideRoundReview(a,r,second,'needs_info','请 HR 确认管理范围',at);assert.equal(a.status,'进行中');assert.equal(feishuDesired(s,people,cfg).some(j=>j.kind==='review'),false);assert.throws(()=>validateSchedule(a,r,{...schedule,interviewer:second.name}),/本轮简历审核/);
 assert.equal(activateRoundReviews(a,hr.name,later),false,'后台激活不能将待补充重置为待确认');supplementReview(a,r,hr,people,'已确认管理范围为三人项目小组',later);assert.equal(r.review.sourceSubmittedAt,at);assert.equal(r.review.status,'pending');assert.equal(feishuDesired(s,people,cfg).find(j=>j.id==='round-review:a:r2').screeningAt,later);
 decideRoundReview(a,r,second,'accepted');assert.doesNotThrow(()=>validateSchedule(a,r,{...schedule,interviewer:second.name}));assert.deepEqual(a.rounds[0],old);
 const expired=laterReview(),app=expired.applications[0];decideRoundReview(app,app.rounds[1],second,'needs_info','补充信息');app.rounds[0].feedback.status='returned';assert.throws(()=>supplementReview(app,app.rounds[1],hr,people,'补充说明'),e=>e.status===409);
});
test('上一轮面评重新提交时保留历史补充回复，旧的未回复要求标记失效，不能继承旧审核通过权限',()=>{
 const s=laterReview(),a=s.applications[0],r=a.rounds[1];decideRoundReview(a,r,second,'needs_info','核实职责',at);supplementReview(a,r,hr,people,'已核实项目职责',later);decideRoundReview(a,r,second,'needs_info','进一步核实指标',later);
 a.rounds[0].feedback.submittedAt='2026-10-28T03:00:00Z';assert.equal(activateRoundReviews(a,hr.name,'2026-10-28T03:00:01Z'),true);assert.equal(r.review.status,'pending');assert.equal(r.review.supplements[0].response,'已核实项目职责');assert.equal(r.review.supplements[1].supersededAt,'2026-10-28T03:00:01Z');assert.throws(()=>validateSchedule(a,r,{...schedule,interviewer:second.name}),/本轮简历审核/);
});
test('真实补充事务校验最新身份、应聘所有权和版本；成功后审计，拒绝重放/冒用/缺失轮次',async()=>{
 const s=fixture();needInitial(s);const pool=fakePool(s),saved=await saveReviewSupplement(pool,hr,'a',{revision:7,response:'已核实到岗时间和项目职责',interviewer:first.name});assert.equal(saved.revision,8);assert.equal(saved.partialCandidates,true);assert.equal(saved.candidates[0].notes,s.candidates[0].notes);assert.equal(saved.applications[0].screening.status,'pending');assert.equal(pool.writes,1);assert.equal(pool.audits,1);
 await assert.rejects(saveReviewSupplement(pool,hr,'a',{revision:7,response:'再次回复'}),e=>e.status===409);assert.equal(pool.writes,1);
 for(const [actor,body] of [[otherHR,{revision:7,response:'无权限回复'}],[first,{revision:7,response:'冒充 HR'}],[{...hr,frozen:1},{revision:7,response:'已冻结'}],[hr,{revision:6,response:'旧版本'}],[hr,{revision:7,roundId:'missing',response:'伪造轮次'}]]){const s=fixture();needInitial(s);const pool=fakePool(s,actor);await assert.rejects(saveReviewSupplement(pool,actor,'a',body));assert.equal(pool.writes,0);assert.equal(pool.rollback,1);}
});
test('不能用普通 HR 整包或记录保存伪造补充回复、重置待补充、换人绕过或直接排期',()=>{
 for(const mode of ['initial','later']){
  const s=mode==='initial'?fixture():laterReview(),a=s.applications[0];if(mode==='initial')needInitial(s);else decideRoundReview(a,a.rounds[1],second,'needs_info','需要补充',at);
  const view=visibleState(s,hr,people,1),validate=input=>validateHRState(s,input,[first.name,second.name,third.name],[file],hr.name,[first.name,second.name,third.name],hr);
  if(mode==='initial'){const input=structuredClone(view);input.applications[0].screening={status:'pending',interviewer:second.name};assert.throws(()=>validate(input),/补充/);}
  else{const changed=structuredClone(view);changed.applications[0].rounds[1].interviewer=third.name;assert.throws(()=>validate(changed),/补充/);const forged=structuredClone(view);forged.applications[0].rounds[1].review.status='accepted';const saved=validate(forged);assert.equal(saved.applications[0].rounds[1].review.status,'needs_info');}
  const scheduled=structuredClone(view),r=scheduled.applications[0].rounds[mode==='initial'?0:1];Object.assign(r,{...schedule,interviewer:mode==='initial'?first.name:second.name});assert.throws(()=>validate(scheduled),/简历/);
 }
});
test('确认人停用时可由 HR 在补充说明后一并改交启用面试官，不能送给停用账号',()=>{
 const s=laterReview(),a=s.applications[0],r=a.rounds[1];decideRoundReview(a,r,second,'needs_info','需补充');const active=people.map(p=>p.id===second.id?{...p,frozen:1}:p);assert.throws(()=>supplementReview(a,r,hr,active,'补充说明'),/启用/);
 supplementReview(a,r,hr,active,'已核实职责，由新确认人继续审核',later,third.name);assert.equal(r.interviewer,third.name);assert.equal(r.review.interviewer,third.name);const view=visibleState(s,third,people,2);assert.equal(view.applications[0].rounds[0].review.supplements[0].response,'已核实职责，由新确认人继续审核');assert.throws(()=>decideRoundReview(a,r,second,'accepted'),/待审核/);
});
test('本人已面试或筛掉的候选人保留 HR 沟通与本人面评，隔离他人面评、草稿、附件和其他候选人',()=>{
 for(const kind of ['initialDecline','laterDecline','interviewed']){
  const s=kind==='initialDecline'?fixture():laterReview(),a=s.applications[0],actor=kind==='initialDecline'?first:kind==='laterDecline'?second:first;
  if(kind==='initialDecline'){a.screening=decideScreening(a,first,'declined','不匹配');terminateFailedApplication(a);}
  if(kind==='laterDecline')decideRoundReview(a,a.rounds[1],second,'declined','经验不匹配');
  if(kind==='interviewed'){a.status='未录用';a.rounds[1].time='2026-10-28T14:00';a.rounds[1].feedback={status:'submitted',summary:'其他面试官的秘密面评',transcript:{id:'secret-file'}};}
  const view=visibleState(s,actor,people,9);assert.equal(view.candidates[0].notes,s.candidates[0].notes);assert.equal(canAccessResume(a,actor),true);assert.equal(interviewGroups(view,actor.name).length,1);assert.ok(!JSON.stringify(view).includes('其他面试官的秘密面评'));assert.ok(!JSON.stringify(view).includes('secret-file'));if(kind==='interviewed')assert.equal(view.applications[0].rounds[0].feedback.summary,'仅属于一面官的正式面评');assert.equal(visibleState(s,third,people,9).candidates.length,0);
 }
});
test('浏览器补充回复仅随授权审核记录返回，MCP 仍不获得 HR 沟通记录或补充回复',()=>{
 const s=fixture(),a=needInitial(s);supplementReview(a,null,hr,people,'仅授权浏览器可见的 HR 补充回复',later);const browser=visibleState(s,first,people,2),mcp=myInterviews(s,first);assert.match(JSON.stringify(browser),/HR 补充回复/);assert.equal(mcp.candidates[0].notes,undefined);assert.equal(mcp.applications[0].screening.supplements,undefined);assert.ok(!JSON.stringify(mcp).includes('仅授权浏览器'));
});
test('撤回的未面试安排不因历史查看而新增 HR 沟通记录权限',()=>{
 const s=fixture(),a=s.applications[0];a.screening={status:'skipped',interviewer:''};a.rounds[0].time='2026-11-01T14:00';a.withdrawnAt=at;a.rounds[0].cancelled=true;assert.equal(visibleState(s,first,people,1).candidates[0].notes,undefined);
});
