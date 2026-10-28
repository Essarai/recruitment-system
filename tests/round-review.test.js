import {test} from 'node:test';
import assert from 'node:assert/strict';
import {activateRoundReviews,reviewSourceValid} from '../src/round-review.js';
import {decideRoundReview,saveRoundReview} from '../server/round-review.js';
import {visibleState} from '../server/database.js';
import {canAccessResume} from '../server/screening.js';
import {round,validateSchedule} from '../src/model.js';
import {validateHRState} from '../server/validation.js';
import {interviewGroups} from '../src/interview-groups.js';
import {feishuDesired} from '../server/feishu-model.js';
const people=[{id:'hr',name:'推荐 HR',role:'HR'},{id:'one',name:'一面官',role:'interviewer'},{id:'two',name:'二面官',role:'interviewer'},{id:'three',name:'三面官',role:'interviewer'}];
const file={id:'f',name:'cv.pdf',size:100,mime:'application/pdf'};
const make=()=>({candidates:[{id:'c',name:'候选人',notes:'私密沟通结论',resumes:[]}],templates:[],applications:[{id:'a',createdBy:'hr',candidateId:'c',job:'产品经理',status:'进行中',reason:'',resume:{id:'f',name:'cv.pdf',size:100,type:'application/pdf'},screening:{status:'skipped',interviewer:''},history:[{at:'2026-10-26T00:00:00Z',actor:'推荐 HR',action:'创建应聘'}],rounds:[{...round('初试'),id:'r1',interviewer:'一面官',time:'2026-10-26T10:00',location:'https://example.com',feedback:{status:'submitted',conclusion:'建议通过',summary:'通过',submittedAt:'2026-10-26T03:00:00Z'}},{...round('复试'),id:'r2',interviewer:'二面官'},{...round('终面'),id:'r3',interviewer:'三面官'}]}]});
const activate=s=>activateRoundReviews(s.applications[0],'推荐 HR','2026-10-26T03:00:01Z');
test('只有正式通过触发紧邻下一轮审核，草稿/待定/加面/失败及已安排轮次不触发，重复运行幂等',()=>{
 for(const feedback of [{status:'draft',conclusion:'建议通过'},{status:'submitted',conclusion:'待定'},{status:'submitted',conclusion:'建议加面'},{status:'submitted',conclusion:'建议不通过'}]){const s=make();s.applications[0].rounds[0].feedback=feedback;assert.equal(activate(s),false);}
 const s=make();assert.equal(activate(s),true);const r=s.applications[0].rounds[1];assert.equal(r.review.interviewer,'二面官');assert.equal(r.review.sentBy,'推荐 HR');assert.equal(s.applications[0].rounds[2].review,undefined);const before=structuredClone(s);assert.equal(activate(s),false);assert.deepEqual(s,before);
 for(const change of [{time:'2026-10-30T10:00'},{cancelled:true}]){const s=make();Object.assign(s.applications[0].rounds[1],change);assert.equal(activate(s),false);}
});
test('下一轮面试官可读取简历和待审沟通记录，不泄露上一轮面评或其他轮次，MCP保持原范围',()=>{
 const s=make();assert.equal(canAccessResume(s.applications[0],people[2]),false);activate(s);
 const view=visibleState(s,people[2],people,1);assert.equal(canAccessResume(s.applications[0],people[2]),true);assert.equal(view.candidates[0].notes,'私密沟通结论');assert.deepEqual(view.applications[0].rounds.map(r=>r.id),['r2']);assert.deepEqual(view.applications[0].history,[]);assert.deepEqual(view.users,[people[2]]);
 const groups=interviewGroups(view,'二面官');assert.equal(groups[0].tasks[0].kind,'roundReview');assert.equal(groups[0].roundCount,0);assert.equal(visibleState(s,people[3],people,1).applications.length,0);assert.equal(visibleState(s,people[2],people,1,{screeningNotes:false}).applications.length,0);
});
test('仅被指定的面试官可以审核；通过后 HR 可安排且不自动创建会议，其他面试官须重新审核',()=>{
 const s=make();activate(s);const a=s.applications[0],r=a.rounds[1],schedule={interviewer:'二面官',time:'2026-10-30T14:00',mode:'线上',location:'https://example.com'};
 assert.throws(()=>validateSchedule(a,r,schedule),/本轮简历审核/);for(const u of [people[0],people[1],people[3]])assert.throws(()=>decideRoundReview(a,r,u,'accepted'),/待审核/);
 decideRoundReview(a,r,people[2],'accepted');assert.equal(a.status,'进行中');assert.equal(r.time,'');assert.doesNotThrow(()=>validateSchedule(a,r,schedule));assert.throws(()=>validateSchedule(a,r,{...schedule,interviewer:'三面官'}),/更换/);assert.throws(()=>decideRoundReview(a,r,people[2],'accepted'),/待审核/);
 const view=visibleState(s,people[2],people,2);assert.equal(view.candidates[0].notes,s.candidates[0].notes);assert.equal(interviewGroups(view,'二面官')[0].waiting,1);
});
test('审核不通过必须有原因，终止应聘并取消未来轮次，保留已提交面评',()=>{
 const s=make();activate(s);const a=s.applications[0];assert.throws(()=>decideRoundReview(a,a.rounds[1],people[2],'declined',''),/原因/);decideRoundReview(a,a.rounds[1],people[2],'declined','岗位经历不匹配');assert.equal(a.status,'未录用');assert.match(a.reason,/复试简历审核不通过/);assert.equal(a.rounds[1].cancelled,true);assert.equal(a.rounds[0].feedback.status,'submitted');assert.equal(canAccessResume(a,people[2]),true);assert.match(a.history[0].action,/不通过/);
});
test('HR 无法伪造审核通过，更换确认人重置审核，已有排期不能借此改人',()=>{
 const s=make();activate(s);const names=people.filter(u=>u.role==='interviewer').map(u=>u.name);const validate=(before,next)=>validateHRState(before,next,names,[file],'推荐 HR',names,people[0]);
 const forged=visibleState(s,people[0],people,1);forged.applications[0].rounds[1].review.status='accepted';const saved=validate(s,forged);assert.equal(saved.applications[0].rounds[1].review.status,'pending');
 decideRoundReview(s.applications[0],s.applications[0].rounds[1],people[2],'accepted');const next=visibleState(s,people[0],people,2);next.applications[0].rounds[1].interviewer='三面官';const changed=validate(s,next);assert.equal(changed.applications[0].rounds[1].review.status,'pending');assert.equal(changed.applications[0].rounds[1].review.interviewer,'三面官');
 const other=visibleState(s,{id:'other',name:'别的HR',role:'HR'},people,2);other.applications[0].rounds[1].interviewer='三面官';assert.throws(()=>validateHRState(s,other,names,[file],'别的HR',names,{id:'other',name:'别的HR',role:'HR'}),/仅创建/);
});
test('飞书逐轮审核任务使用独立稳定 ID，接受后不再通知，前序面评退回则任务失效',()=>{
 const s=make();activate(s);const cfg={backfill:true,bindings:{two:'ou_two'},calendarId:'calendar'};let jobs=feishuDesired(s,people,cfg);const task=jobs.find(t=>t.id==='round-review:a:r2');assert.equal(task.openId,'ou_two');assert.equal(task.kind,'review');assert.match(task.title,/复试/);assert.deepEqual(feishuDesired(s,people,{...cfg,pilotUserId:'one'}).filter(t=>t.id.startsWith('round-review:')),[]);
 s.applications[0].rounds[0].feedback.status='returned';assert.equal(reviewSourceValid(s.applications[0],s.applications[0].rounds[1]),false);assert.equal(feishuDesired(s,people,cfg).some(t=>t.id===task.id),false);assert.throws(()=>decideRoundReview(s.applications[0],s.applications[0].rounds[1],people[2],'accepted'),/待审核/);
});
test('后续每轮可连续触发审核，缺少默认面试官时等待 HR 指定，不跳过节点',()=>{
 const s=make();s.applications[0].rounds[1].interviewer='';activate(s);assert.equal(s.applications[0].rounds[1].review.interviewer,'');assert.equal(s.applications[0].rounds[2].review,undefined);
 const a=s.applications[0];a.rounds[1].interviewer='二面官';a.rounds[1].review.interviewer='二面官';decideRoundReview(a,a.rounds[1],people[2],'accepted');a.rounds[1].feedback={status:'submitted',conclusion:'建议通过',submittedAt:'2026-10-27T00:00:00Z'};assert.equal(activate(s),true);assert.equal(a.rounds[2].review.interviewer,'三面官');
});
test('审核接口拒绝过期版本并回滚，不写入审核结果',async()=>{
 let rollback=false,writes=0;const conn={beginTransaction:async()=>{},query:async()=>[[{revision:8,payload:make()}]],execute:async()=>{writes++},rollback:async()=>{rollback=true},release(){}};
 await assert.rejects(saveRoundReview({getConnection:async()=>conn},people[2],'a','r2',{revision:7,decision:'accepted'}),e=>e.status===409);assert.equal(rollback,true);assert.equal(writes,0);
});

test('真实面评保存路径在正式通过时创建审核，草稿/待定不创建',async()=>{
 const {saveInterviewFeedback}=await import('../server/feedback.js');
 for(const [draft,conclusion,expected] of [[true,'建议通过',false],[false,'待定',false],[false,'建议通过',true],[false,'建议不通过',false]]){
  const state=make();state.applications[0].rounds[0].feedback={status:'none'};let persisted;
  const conn={beginTransaction:async()=>{},query:async sql=>sql.includes('recruitment_state')?[[{revision:1,payload:state}]]:[people],execute:async(sql,args)=>{if(sql.startsWith('UPDATE recruitment_state'))persisted=JSON.parse(args[0]);return [{}]},commit:async()=>{},rollback:async()=>{},release(){}};
  const pool={getConnection:async()=>conn,query:async()=>[people]};
  await saveInterviewFeedback(pool,people[1],'a','r1',{revision:1,draft,completed:true,feedback:{summary:'实际面试评价',conclusion}});
  assert.equal(!!persisted.applications[0].rounds[1].review,expected);if(expected)assert.equal(persisted.applications[0].rounds[1].review.interviewer,'二面官');
 }
});
test('不能通过新增即排期的轮次绕过审核，也不能借同时删除前序节点绕过轮次顺序',()=>{
 const s=make();activate(s);const next=visibleState(s,people[0],people,1);next.applications[0].rounds.push({...round('加面'),id:'extra',interviewer:'三面官',time:'2026-10-30T10:00',location:'https://example.com'});assert.throws(()=>validateHRState(s,next,['一面官','二面官','三面官'],[file],'推荐 HR'),/新增轮次须先/);
});
