import {test} from 'node:test';import assert from 'node:assert/strict';
import {buildRecruitmentDashboard,mountRecruitmentDashboard,recruitmentDay,recruitmentTime} from '../server/recruitment-dashboard.js';
const users=[{id:'ha',name:'HR甲',role:'HR'},{id:'hb',name:'HR乙',role:'HR',frozen:1},{id:'admin',name:'管理员',role:'admin'}],admin=users[2],now=Date.parse('2026-10-19T04:00:00Z');
const date=day=>`2026-10-${day}T04:00:00Z`,period={from:'2026-10-01',to:'2026-10-19'};
const round=(name,time='',feedback={status:'none'})=>({id:name,name,time,interviewer:'面试官',feedback,cancelled:false});
function app(id,owner,created,extra={}){return {id,candidateId:id==='i'?'a':id,job:'产品',createdBy:owner,status:'进行中',history:created?[{at:created,actor:users.find(u=>u.id===owner)?.name,action:'创建应聘'}]:[],screening:{status:'skipped',interviewer:''},rounds:[round('初试')],...extra};}
function fixture(){return {candidates:[{id:'a',name:'候选人甲',createdBy:'ha',createdAt:date('01'),email:'private@example.com',notes:'HR私有备注'},{id:'c',name:'候选人乙'},{id:'d',name:'候选人丙',createdBy:'hb',createdAt:'2026-09-01T04:00:00Z'}],applications:[
 app('a','ha',date('01'),{screening:{status:'pending',sentAt:date('02')}}),
 app('b','ha','2026-09-20T04:00:00Z',{status:'公司决定录用',endedAt:date('05'),rounds:[round('初试',date('03'),{status:'submitted',conclusion:'建议通过',submittedAt:date('04')})]}),
 app('c','hb',date('03'),{status:'未录用',endedAt:date('10'),screening:{status:'accepted',reviewedAt:date('04')},rounds:[round('初试',date('09'),{status:'submitted',conclusion:'建议不通过',submittedAt:date('10'),summary:'私有评价正文'})]}),
 app('d','hb',date('04'),{rounds:[round('初试','2026-10-21T10:00')]}),
 app('e','admin',date('05')),
 app('f','ha',date('06'),{screening:{status:'accepted',reviewedAt:date('07')},rounds:[{...round('初试',date('09'),{status:'draft',summary:'私有草稿'}),scheduleEvents:[{type:'created',at:date('08'),actorId:'admin',actorName:'管理员'},{type:'rescheduled',at:date('09'),actorId:'ha',actorName:'HR甲'}]}]}),
 app('g','ha',date('07'),{rounds:[round('初试',date('07'),{status:'submitted',conclusion:'待定',submittedAt:date('08')})]}),
 app('i','ha',date('09')),
 app('unknown',null,null,{status:'候选人退出',rounds:[]})
 ]};}
test('流量、当前存量、创建批次与结果口径分开，重新捞起不重复统计入库人',()=>{
 const state=fixture(),before=structuredClone(state),report=buildRecruitmentDashboard(state,users,admin,period,now);
 assert.deepEqual(report.overview,{created:7,ongoing:6,hired:1,terminated:1,imports:1});assert.equal(report.conversion.cohort,7);assert.equal(report.conversion.hired,0);assert.equal(report.conversion.ongoing,6);assert.equal(report.conversion.scheduled,4);
 assert.deepEqual(Object.fromEntries(report.current.map(p=>[p.key,p.count])),{review:1,schedule:2,feedback:1,decision:1,interview:1});assert.equal(report.queue.length,6);assert.equal(report.outcomes.reduce((sum,r)=>sum+r.count,0),2);
 const ha=report.hrRows.find(r=>r.id==='ha');assert.equal(ha.created,4);assert.equal(ha.ongoing,4);assert.equal(ha.hired,1);assert.equal(ha.imported,1);assert.equal(ha.waitHR,2);assert.equal(ha.waitInterviewer,2);assert.deepEqual(state,before);
 assert.ok(!JSON.stringify(report).includes('private@example.com'));for(const text of ['HR私有备注','私有评价正文','私有草稿'])assert.ok(!JSON.stringify(report).includes(text));
});
test('HR与岗位筛选交集一致，归属不因管理员代操作变化，按实际操作人单独归因',()=>{
 const report=buildRecruitmentDashboard(fixture(),users,admin,{...period,hr:'ha',job:'产品'},now);assert.equal(report.overview.created,4);assert.equal(report.overview.ongoing,4);assert.equal(report.overview.imports,null);assert.equal(report.operations.created,1);assert.equal(report.operations.rescheduled,1);assert.equal(report.operations.people.find(p=>p.id==='admin').created,1);assert.ok(report.queue.every(r=>r.ownerId==='ha'&&r.job==='产品'));
 const empty=buildRecruitmentDashboard(fixture(),users,admin,{...period,job:'不存在'},now);assert.equal(empty.overview.created,0);assert.equal(empty.queue.length,0);assert.equal(empty.efficiency[0].medianHours,null);
});
test('确认跳过不进入确认分母，待定不算通过，时效只用有效时间与原始排期操作',()=>{
 const report=buildRecruitmentDashboard(fixture(),users,admin,period,now);assert.equal(report.conversion.accepted,2);assert.equal(report.conversion.pendingReview,1);assert.equal(report.conversion.skipped,4);
 assert.equal(report.rounds[0].passed,0);assert.equal(report.rounds[0].failed,1);assert.equal(report.rounds[0].undecided,1);assert.equal(report.rounds[0].additional,0);
 const time=Object.fromEntries(report.efficiency.map(r=>[r.key,r]));assert.equal(time.confirmation.medianHours,24);assert.equal(time.confirmation.samples,2);assert.equal(time.scheduling.medianHours,24);assert.equal(time.scheduling.samples,1);assert.equal(time.feedback.medianHours,24);assert.equal(time.feedback.samples,3);assert.equal(time.cycle.medianHours,264);
 const future=report.queue.find(r=>r.id==='d');assert.equal(future.phase,'interview');assert.equal(future.waitHours,null);
});
test('历史未知归属、时间和入库记录不猜算；全部时间可显示已存在但缺失日期的结果',()=>{
 const state=fixture(),report=buildRecruitmentDashboard(state,users,admin,period,now);assert.equal(report.coverage.owner,1);assert.equal(report.coverage.creationTime,1);assert.equal(report.coverage.endTime,1);assert.equal(report.coverage.unknownImports,1);
 const all=buildRecruitmentDashboard(state,users,admin,{},now);assert.equal(all.overview.created,9);assert.equal(all.overview.terminated,2);assert.equal(all.outcomes.find(r=>r.key==='withdrawn').count,1);
 const legacy=app('legacy',null,date('01'));delete legacy.createdBy;legacy.history.unshift({actor:'HR乙',at:date('03'),action:'更新应聘'});legacy.history[1].actor='HR甲';state.applications=[legacy];assert.equal(buildRecruitmentDashboard(state,users,admin,period,now).queue[0].ownerId,'ha');
});
test('北京时间日界线与无时区计划时间正确，错误日期和倒序范围被拒绝',()=>{
 assert.equal(recruitmentDay('2026-09-30T16:00:00Z'),'2026-10-01');assert.equal(recruitmentDay('2026-10-19T16:00:00Z'),'2026-10-20');assert.equal(recruitmentTime('2026-10-20T10:00'),Date.parse('2026-10-20T02:00:00Z'));
 const state=fixture();state.applications=[app('first','ha','2026-09-30T16:00:00Z'),app('last','ha','2026-10-19T15:59:59Z'),app('next','ha','2026-10-19T16:00:00Z')];assert.equal(buildRecruitmentDashboard(state,users,admin,period,now).overview.created,2);
 for(const filters of [{from:'2026-02-30'},{to:'invalid'},{from:'2026-10-20',to:'2026-10-19'}])assert.throws(()=>buildRecruitmentDashboard(state,users,admin,filters,now),e=>e.status===400);
});
test('大盘接口仅管理员可访问，拒绝 HR/面试官时不读取业务数据',async()=>{
 let handler,reads=0;mountRecruitmentDashboard({get(path,fn){if(path==='/api/admin/recruitment-dashboard')handler=fn;}},{loadSnapshot:async()=>{reads++;return {state:fixture(),users};}});
 for(const role of ['HR','interviewer',undefined]){let status,result;await handler({user:{role},query:period},{status(value){status=value;return this;},json(value){result=value;}});assert.equal(status,403);assert.match(result.error,/仅管理员/);assert.equal(reads,0);assert.throws(()=>buildRecruitmentDashboard(fixture(),users,{role},period,now),e=>e.status===403);}
 let result;await handler({user:admin,query:period},{json(value){result=value;}});assert.equal(reads,1);assert.equal(result.overview.created,7);
});
test('空库不伪造转化或时效，负时长不进入中位数',()=>{
 const empty=buildRecruitmentDashboard({candidates:[],applications:[]},users,admin,period,now);assert.deepEqual(empty.overview,{created:0,ongoing:0,hired:0,terminated:0,imports:0});assert.equal(empty.conversion.cohort,0);assert.ok(empty.efficiency.every(r=>r.samples===0&&r.medianHours===null));
 const state=fixture();state.applications=[app('a','ha',date('10'),{screening:{status:'accepted',reviewedAt:date('09')},rounds:[round('初试',date('12'),{status:'submitted',submittedAt:date('11')})]})];const result=buildRecruitmentDashboard(state,users,admin,period,now);assert.equal(result.efficiency.find(r=>r.key==='confirmation').samples,0);assert.equal(result.efficiency.find(r=>r.key==='feedback').samples,0);
});

test('新版大盘统一创建批次，漏斗按应聘去重，岗位与个人汇总可核对',()=>{
 const report=buildRecruitmentDashboard(fixture(),users,admin,period,now),a=report.analysis;
 assert.equal(a.summary.created,7);assert.equal(a.summary.hired,0);assert.equal(a.summary.submitted,2);assert.equal(a.summary.passed,0);assert.equal(a.summary.failed,1);assert.equal(a.summary.passRate,0);assert.equal(a.summary.cycleSamples,1);assert.equal(a.summary.cycleHours,168);
 assert.equal(a.people.reduce((s,p)=>s+p.created,0),a.summary.created);assert.equal(a.jobs.reduce((s,p)=>s+p.created,0),a.summary.created);
 assert.equal(a.funnel.find(f=>f.key==='submitted').count,2);assert.equal(a.records.filter(r=>r.reached.submitted).length,2);assert.ok(!a.records.some(r=>r.id==='b'));
 const candidate=fixture();candidate.applications=[app('a','ha',date('01'),{rounds:[round('初试',date('03'),{status:'submitted',conclusion:'建议通过',submittedAt:date('04')}),round('复试',date('05'),{status:'submitted',conclusion:'待定',submittedAt:date('06')})]})];const x=buildRecruitmentDashboard(candidate,users,admin,period,now).analysis;assert.equal(x.summary.submitted,1);assert.equal(x.funnel.find(f=>f.key==='passed').count,1);assert.equal(x.summary.passRate,1);
});
test('HR 大盘服务端强制本人范围，伪造 HR 筛选无效；面试官在读取前被拒绝',async()=>{
 const r=buildRecruitmentDashboard(fixture(),users,users[0],{...period,hr:'hb'},now);assert.equal(r.filters.hr,'ha');assert.ok(r.analysis.records.every(a=>a.ownerId==='ha'));assert.ok(r.analysis.people.every(a=>a.id==='ha'));assert.equal(r.analysis.summary.created,4);
 const routes=new Map();let reads=0;mountRecruitmentDashboard({get(path,fn){routes.set(path,fn);}},{loadSnapshot:async()=>{reads++;return {state:fixture(),users};}});let code,result;const res={status(n){code=n;return this;},json(v){result=v;}};await routes.get('/api/recruitment-dashboard')({user:{role:'interviewer'},query:{}},res);assert.equal(code,403);assert.equal(reads,0);await routes.get('/api/recruitment-dashboard')({user:users[0],query:{...period,hr:'hb'}},res);assert.equal(result.filters.hr,'ha');assert.ok(result.analysis.records.every(r=>r.ownerId==='ha'));
});
test('缺失前序记录时不伪造漏斗转化，零样本不伪造通过率和结束用时',()=>{
 const state=fixture();state.applications=[app('a','ha',date('01'),{status:'公司决定录用',rounds:[]})];const a=buildRecruitmentDashboard(state,users,admin,period,now).analysis;assert.equal(a.funnel.find(f=>f.key==='hired').conversion,null);assert.equal(a.summary.passRate,null);assert.equal(a.summary.cycleHours,null);assert.equal(a.summary.hired,1);
});
