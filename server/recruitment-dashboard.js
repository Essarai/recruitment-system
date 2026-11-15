import {reviewReminderDue} from './review-reminder.js';
import {hasInterviewArrangement,isSpecialInterview} from '../src/interview-arrangement.js';
import {pendingHRDecision,reviewSourceValid} from '../src/round-review.js';
import {applicationStage} from '../src/model.js';
import {canManageAccounts} from '../src/permissions.js';
const HOUR=3600000;
export function recruitmentTime(value){
 if(value===undefined||value===null||value==='')return null;
 const text=String(value),withZone=/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d+)?)?$/.test(text)?text+'+08:00':text;
 const time=typeof value==='number'?value:Date.parse(withZone);return Number.isFinite(time)?time:null;
}
export function recruitmentDay(value){const time=recruitmentTime(value);return time===null?'':new Date(time+8*HOUR).toISOString().slice(0,10);}
function creation(app){return [...(app.history||[])].filter(h=>h.action?.startsWith('创建应聘')).sort((a,b)=>(recruitmentTime(a.at)??Infinity)-(recruitmentTime(b.at)??Infinity))[0];}
function ownerOf(app,users){const event=creation(app);return users.find(u=>app.createdBy?u.id===app.createdBy:u.name===event?.actor)||{id:'unassigned',name:'历史未归属',role:'unknown'};}
function duration(start,end){const a=recruitmentTime(start),b=recruitmentTime(end);return a!==null&&b!==null&&b>=a?(b-a)/HOUR:null;}
function median(values){if(!values.length)return null;const sorted=[...values].sort((a,b)=>a-b),middle=Math.floor(sorted.length/2);return sorted.length%2?sorted[middle]:(sorted[middle-1]+sorted[middle])/2;}
const phases={review:{name:'待确认简历',party:'面试官'},schedule:{name:'待 HR 安排',party:'HR'},feedback:{name:'待提交面评',party:'面试官'},decision:{name:'待 HR 决策',party:'HR'},interview:{name:'待面试',party:'按计划进行'}};
function currentPhase(app,created,now){
 if(app.status!=='进行中')return null;
 const screening=app.screening;
 if(screening?.status==='needs_info')return {key:'decision',round:'简历确认 · 需 HR 补充',since:screening.reviewedAt,clock:'距提出补充要求'};
 if(screening?.status==='pending')return {key:'review',round:'简历确认',since:screening.sentAt,handler:screening.interviewer,clock:'距推送简历'};
 if(screening&&screening.status!=='skipped'&&screening.status!=='accepted')return {key:'schedule',round:'待指定简历确认人',since:created,clock:'距创建应聘'};
 const pending=pendingHRDecision(app);
 if(pending)return {key:'decision',round:`${pending.source.name} · ${pending.source.feedback.conclusion}`,since:pending.source.feedback.submittedAt,clock:'距本轮面评提交'};
 const index=app.rounds.findIndex(r=>r.feedback.status!=='submitted');
 if(index<0){const times=app.rounds.map(r=>recruitmentTime(r.feedback.submittedAt)).filter(v=>v!==null);return {key:'decision',round:'所有轮次面评已交',since:times.length?Math.max(...times):null,clock:'距最后面评提交'};}
 const round=app.rounds[index],time=recruitmentTime(round.time);
 if(isSpecialInterview(round)&&!round.cancelled)return {key:'feedback',round:round.name+' · 特殊',since:round.specialRecordedAt,handler:round.interviewer,clock:'距特殊面试补录'};
 if(!round.time&&round.review?.status==='needs_info'&&reviewSourceValid(app,round))return {key:'decision',round:round.name+' · 需 HR 补充',since:round.review.reviewedAt,clock:'距提出补充要求'};
 if(!round.time&&round.review?.status==='pending'&&reviewSourceValid(app,round))return {key:round.review.interviewer?'review':'schedule',round:round.name+(round.review.interviewer?'简历审核':'待指定审核面试官'),since:round.review.sentAt,handler:round.review.interviewer,clock:'距发起本轮审核'};
 if(round.cancelled||time===null){const cancellation=[...(round.scheduleEvents||[])].reverse().find(e=>e.type==='cancelled');return {key:'schedule',round:round.name,since:cancellation?.at||(round.review?.status==='accepted'&&round.review.reviewedAt)||(index?app.rounds[index-1].feedback.submittedAt:screening?.reviewedAt||created),clock:'距进入待安排'};}
 const finish=time+(round.duration||60)*60000;
 if(['draft','returned'].includes(round.feedback.status)||finish<=now)return {key:'feedback',round:round.name,since:finish,handler:round.interviewer,scheduledTime:round.time,clock:'距计划面试结束'};
 return {key:'interview',round:round.name,since:null,clock:'计划面试',scheduledTime:round.time};
}
function outcome(app){
 if(app.status==='公司决定录用')return 'hired';
 if(app.status==='候选人退出')return 'withdrawn';
 if(app.screening?.status==='declined')return 'reviewRejected';
 if(app.rounds.some(r=>r.feedback.status==='submitted'&&r.feedback.conclusion==='建议不通过'))return 'interviewRejected';
 return 'other';
}
const outcomeNames={hired:'公司决定录用',reviewRejected:'简历确认不通过',interviewRejected:'面试不通过',withdrawn:'候选人退出',other:'其他原因终止'};
function validDate(value){return /^\d{4}-\d\d-\d\d$/.test(value)&&recruitmentDay(value+'T00:00:00+08:00')===value;}
export function buildRecruitmentDashboard(state,users,viewer,filters={},now=Date.now()){
 if(!['admin','HR'].includes(viewer?.role)||viewer.role==='HR'&&!viewer.id)throw Object.assign(Error('仅管理员或 HR 可查看招聘大盘'),{status:403});
 const from=String(filters.from||''),to=String(filters.to||''),hr=viewer.role==='HR'?viewer.id:String(filters.hr||''),job=String(filters.job||'');
 if((from&&!validDate(from))||(to&&!validDate(to))||(from&&to&&from>to))throw Object.assign(Error('请选择有效且顺序正确的日期范围'),{status:400});
 if(hr.length>80||job.length>160)throw Object.assign(Error('筛选条件无效'),{status:400});
 const inPeriod=value=>{const day=recruitmentDay(value);return !from&&!to||!!day&&(!from||day>=from)&&(!to||day<=to);};
 const candidates=new Map(state.candidates.map(c=>[c.id,c])),nowTime=recruitmentTime(now),people=users.filter(u=>['HR','admin'].includes(u.role));
 const records=state.applications.filter(a=>!a.withdrawnAt).map(app=>({app,owner:ownerOf(app,people),created:recruitmentTime(creation(app)?.at)!==null?creation(app).at:null})).filter(r=>(!hr||r.owner.id===hr)&&(!job||r.app.job===job));
 const cohort=records.filter(r=>inPeriod(r.created)),ended=records.filter(r=>r.app.status!=='进行中'&&inPeriod(r.app.endedAt));
 const groups=new Map(people.filter(u=>!hr||u.id===hr).map(u=>[u.id,{id:u.id,name:u.name,role:u.role,frozen:!!u.frozen,imported:0,created:0,ongoing:0,waitHR:0,waitInterviewer:0,hired:0,terminated:0}]));
 function group(owner){if(!groups.has(owner.id))groups.set(owner.id,{id:owner.id,name:owner.name,role:owner.role,imported:0,created:0,ongoing:0,waitHR:0,waitInterviewer:0,hired:0,terminated:0});return groups.get(owner.id);}
 const current=Object.fromEntries(Object.keys(phases).map(key=>[key,0])),queue=[],outcomes=Object.fromEntries(Object.keys(outcomeNames).map(key=>[key,0]));
 const coverage={creationTime:records.filter(r=>!r.created).length,owner:records.filter(r=>r.owner.id==='unassigned').length,endTime:records.filter(r=>r.app.status!=='进行中'&&recruitmentTime(r.app.endedAt)===null).length,legacyScheduledRounds:0,unknownImports:state.candidates.filter(c=>(viewer.role!=='HR'||c.createdBy===viewer.id)&&(!c.createdBy||recruitmentTime(c.createdAt)===null)).length};
 for(const record of records){const {app,owner,created}=record,phase=currentPhase(app,created,nowTime);if(!phase)continue;
  const entry=group(owner);entry.ongoing++;current[phase.key]++;if(['schedule','decision'].includes(phase.key))entry.waitHR++;if(['review','feedback'].includes(phase.key))entry.waitInterviewer++;
  const waitHours=duration(phase.since,nowTime);
  const reviewDue=reviewReminderDue(phase.since);
  const overdue=phase.key==='review'?reviewDue!==null&&reviewDue<=nowTime:phase.key!=='interview'&&waitHours!==null&&waitHours>=24;
  queue.push({id:app.id,candidateName:candidates.get(app.candidateId)?.name||'候选人已缺失',job:app.job,owner:owner.name,ownerId:owner.id,phase:phase.key,phaseName:phases[phase.key].name,party:phases[phase.key].party,round:phase.round,waitHours,overdue,handler:phase.handler||(['schedule','decision'].includes(phase.key)?owner.name:''),clock:phase.clock,scheduledTime:phase.scheduledTime||null});
 }
 for(const r of cohort)group(r.owner).created++;
 for(const r of ended){const key=outcome(r.app);outcomes[key]++;group(r.owner)[key==='hired'?'hired':'terminated']++;}
 for(const c of state.candidates){if(!c.createdBy||recruitmentTime(c.createdAt)===null||!inPeriod(c.createdAt)||hr&&c.createdBy!==hr||job)continue;const person=people.find(u=>u.id===c.createdBy)||{id:'unassigned',name:'历史未归属',role:'unknown'};group(person).imported++;}
 const operationPeople=new Map(),operationCounts={created:0,rescheduled:0,cancelled:0};
 const times={confirmation:[],scheduling:[],feedback:[],cycle:[]};
 for(const {app,created} of records){
  if(['accepted','declined'].includes(app.screening?.status)&&inPeriod(app.screening.reviewedAt)){const value=duration(created,app.screening.reviewedAt);if(value!==null)times.confirmation.push(value);}
  const firstEvent=app.rounds[0]?.scheduleEvents?.find(e=>e.type==='created');
  if(app.screening?.status==='accepted'&&firstEvent&&inPeriod(firstEvent.at)){const value=duration(app.screening.reviewedAt,firstEvent.at);if(value!==null)times.scheduling.push(value);}
  for(const round of app.rounds){
   if(round.time&&!round.scheduleEvents?.some(e=>e.type==='created'&&recruitmentTime(e.at)!==null))coverage.legacyScheduledRounds++;
   for(const event of round.scheduleEvents||[]){if(recruitmentTime(event.at)===null||!inPeriod(event.at)||!Object.hasOwn(operationCounts,event.type))continue;operationCounts[event.type]++;const person=people.find(p=>p.id===event.actorId)||{id:event.actorId?`legacy:${event.actorId}`:event.actorName?`legacy-name:${event.actorName}`:'unassigned',name:event.actorName||'历史未归属'};if(!operationPeople.has(person.id))operationPeople.set(person.id,{id:person.id,name:person.name,created:0,rescheduled:0,cancelled:0});operationPeople.get(person.id)[event.type]++;}
   if(round.feedback.status==='submitted'&&inPeriod(round.feedback.submittedAt)){const value=duration(round.time,round.feedback.submittedAt);if(value!==null)times.feedback.push(value);}
  }
  if(app.status!=='进行中'&&inPeriod(app.endedAt)){const value=duration(created,app.endedAt);if(value!==null)times.cycle.push(value);}
 }
 const roundResults=new Map();let accepted=0,declined=0,pendingReview=0,skipped=0,scheduled=0,hired=0,cohortOngoing=0;
 for(const {app} of cohort){
  if(app.screening?.status==='accepted')accepted++;else if(app.screening?.status==='declined')declined++;else if(app.screening?.status==='skipped'||!app.screening&&app.rounds.some(r=>hasInterviewArrangement(r)))skipped++;else pendingReview++;
  if(app.rounds.some(r=>hasInterviewArrangement(r)))scheduled++;if(app.status==='公司决定录用')hired++;if(app.status==='进行中')cohortOngoing++;
  app.rounds.forEach((r,index)=>{if(r.feedback.status!=='submitted')return;const key=`${index}:${r.name}`;if(!roundResults.has(key))roundResults.set(key,{key,index:index+1,name:r.name,passed:0,failed:0,additional:0,undecided:0,unknown:0});const row=roundResults.get(key);row[{'建议通过':'passed','建议不通过':'failed','建议加面':'additional','待定':'undecided'}[r.feedback.conclusion]||'unknown']++;});
 }
 queue.sort((a,b)=>Number(a.phase==='interview')-Number(b.phase==='interview')||(b.waitHours??-1)-(a.waitHours??-1));
 const tracking=state.recruitmentTracking||{};
 const contacts=new Map((tracking.contacts||[]).map(r=>[r.id,r]));
 const appliedIds=new Set(state.applications.filter(a=>!a.withdrawnAt&&(viewer.role!=='HR'||ownerOf(a,people).id===viewer.id)).map(a=>a.candidateId));
 const importRecords=state.candidates.filter(c=>recruitmentTime(c.createdAt)!==null&&inPeriod(c.createdAt)&&(!hr||c.createdBy===hr||hr==='unassigned'&&!c.createdBy)).map(c=>{const owner=users.find(u=>u.id===c.createdBy);return {id:c.id,name:c.name,createdAt:c.createdAt,ownerId:c.createdBy||'unassigned',ownerName:owner?.name||'历史未归属',contact:contacts.get(c.id)||null,applied:appliedIds.has(c.id)};}).sort((a,b)=>recruitmentTime(b.createdAt)-recruitmentTime(a.createdAt));
 const importPeople=new Map(people.filter(p=>!hr||p.id===hr).map(p=>[p.id,{id:p.id,name:p.name,count:0}]));
 for(const r of importRecords){
  if(!importPeople.has(r.ownerId))importPeople.set(r.ownerId,{id:r.ownerId,name:r.ownerName,count:0});
  const row=importPeople.get(r.ownerId);
  row.count++;
  row.completed=(row.completed||0)+Number(Boolean(r.contact?.intent&&r.contact.availability&&r.contact.recommendation));
  row.applied=(row.applied||0)+Number(r.applied);
 }
 const month=String(filters.month||recruitmentDay(nowTime).slice(0,7));
 if(!validDate(month+'-01'))throw Error('请选择有效的招聘目标月份');
 const offers=new Map((tracking.offers||[]).map(o=>[o.id,o]));
 const offerRecords=records.filter(({app})=>app.status==='公司决定录用').map(({app,owner})=>({
  id:app.id,name:candidates.get(app.candidateId)?.name||'候选人已缺失',candidateId:app.candidateId,job:app.job,owner:owner.name,ownerId:owner.id,offer:offers.get(app.id)||null
 }));
 const recordById=new Map(records.map(r=>[r.app.id,r]));
 function monthlyPerformance({job:jobName,ownerId}){
  const matches=r=>(!jobName||r.job===jobName)&&(!ownerId||r.ownerId===ownerId);
  const planned=goals.filter(matches),offers=offerRecords.filter(matches);
  const joined=offers.filter(r=>r.offer?.joined?.startsWith(month));
  const cycleDays=joined.map(r=>{
   const start=recruitmentDay(recordById.get(r.id)?.created),end=r.offer.joined;
   return start&&end>=start?(Date.parse(end)-Date.parse(start))/86400000:null;
  }).filter(v=>v!==null);
  return {
   target:planned.length?planned.reduce((sum,g)=>sum+g.target,0):null,
   joined:new Set(joined.map(r=>r.candidateId)).size,
   waitingToJoin:offers.filter(r=>r.offer?.response==='accepted'&&!r.offer.joined).length,
   medianJoinDays:median(cycleDays),joinCycleSamples:cycleDays.length,
   overdue:queue.filter(r=>matches(r)&&r.overdue).length,
   positions:[...new Set([...planned.map(r=>r.job),...cohort.filter(r=>(!jobName||r.app.job===jobName)&&(!ownerId||r.owner.id===ownerId)).map(r=>r.app.job),...joined.map(r=>r.job)])],
   overdueHR:queue.filter(r=>matches(r)&&r.overdue&&['schedule','decision'].includes(r.phase)).length
  };
 }
 const goals=(tracking.goals||[]).filter(g=>g.month===month&&(!job||g.job===job)&&(!hr||g.ownerId===hr));
 const monthlyJobs=new Set([...goals.map(g=>g.job),...offerRecords.filter(r=>r.offer&&[r.offer.issued,r.offer.responded,r.offer.joined].some(date=>date?.startsWith(month))).map(r=>r.job)]);
 const monthly=[...monthlyJobs].sort().map(jobName=>{
  const planned=goals.filter(g=>g.job===jobName),outcomes=offerRecords.filter(r=>r.job===jobName);
  const issued=outcomes.filter(r=>r.offer?.issued?.startsWith(month));
  const accepted=issued.filter(r=>r.offer.response==='accepted').length,declined=issued.filter(r=>r.offer.response==='declined').length;
  const joined=new Set(outcomes.filter(r=>r.offer?.joined?.startsWith(month)).map(r=>r.candidateId)).size;
  const target=planned.length?planned.reduce((total,g)=>total+g.target,0):null;
  return {job:jobName,target,issued:issued.length,accepted,declined,joined};
 });
 const reviewJobs=[...new Set([...monthlyJobs,...cohort.map(r=>r.app.job),...queue.map(r=>r.job),...offerRecords.filter(r=>r.offer?.response==='accepted'&&!r.offer.joined).map(r=>r.job)])];
 const review={team:monthlyPerformance({}),jobs:reviewJobs.map(jobName=>({
  job:jobName,...monthlyPerformance({job:jobName}),
  owners:[...new Set([...goals.filter(g=>g.job===jobName).map(g=>people.find(p=>p.id===g.ownerId)?.name||'历史未归属'),...records.filter(r=>r.app.job===jobName).map(r=>r.owner.name)])]
 })),people:[...groups.values()].map(p=>({id:p.id,...monthlyPerformance({ownerId:p.id})}))};
 const backlog=Object.entries(phases).filter(([key])=>key!=='interview').map(([key,phase])=>{
  const entries=queue.filter(r=>r.phase===key);
  return {key,name:phase.name,count:entries.length,overdue:entries.filter(r=>r.overdue).length,medianHours:median(entries.map(r=>r.waitHours).filter(n=>n!==null))};
 });
 return {backlog,review,tracking:{month,goals,monthly,offerRecords},imports:{records:importRecords,people:[...importPeople.values()],total:importRecords.length},analysis:recruitmentAnalysis(cohort,candidates,[...groups.values()],offers),generatedAt:new Date(nowTime).toISOString(),filters:{from,to,hr,job},overview:{created:cohort.length,ongoing:queue.length,hired:outcomes.hired,terminated:ended.length-outcomes.hired,imports:job?null:[...groups.values()].reduce((sum,g)=>sum+g.imported,0)},current:Object.entries(phases).map(([key,phase])=>({key,...phase,count:current[key]})),outcomes:Object.entries(outcomeNames).map(([key,name])=>({key,name,count:outcomes[key]})),hrRows:[...groups.values()].sort((a,b)=>a.name.localeCompare(b.name,'zh-CN')),operations:{...operationCounts,people:[...operationPeople.values()].sort((a,b)=>a.name.localeCompare(b.name,'zh-CN'))},conversion:{cohort:cohort.length,accepted,declined,pendingReview,skipped,scheduled,hired,ongoing:cohortOngoing},rounds:[...roundResults.values()].sort((a,b)=>a.index-b.index||a.name.localeCompare(b.name,'zh-CN')),efficiency:Object.entries(times).map(([key,values])=>({key,samples:values.length,medianHours:median(values)})),coverage,queue};
}

// All panels use the same creation cohort; later progress is the current snapshot.
export function recruitmentAnalysis(records,candidates,people,offers=new Map()){
 const stages=[['created','新建应聘'],['scheduled','已安排面试'],['submitted','已提交面评'],['passed','曾获通过面评'],['hired','公司决定录用'],['offered','发出 Offer'],['offerAccepted','接受 Offer'],['joined','实际入职']];
 const rows=records.map(({app,owner,created})=>{
  const submitted=app.rounds.filter(r=>r.feedback.status==='submitted'),stage=applicationStage(app);
  const events=(app.history||[]).map(h=>({at:h.at,text:h.action,actor:h.actor}));
  const times=[created,app.endedAt,app.screening?.reviewedAt,...events.map(e=>e.at),...submitted.map(r=>r.feedback.submittedAt)].map(recruitmentTime).filter(t=>t!==null);
  const offer=offers.get(app.id),first=app.rounds[0];
  const booked=first?.scheduleEvents?.find(e=>e.type==='created'&&recruitmentTime(e.at)!==null);
  const ready=app.screening?.status==='accepted'?app.screening.reviewedAt:app.screening?.status==='skipped'?created:null;
  const bookingHours=first&&!isSpecialInterview(first)&&duration(created,ready)!==null?duration(ready,booked?.at):null;
  const sent=Boolean(app.screening?.sentAt||app.screening?.interviewer&&['pending','needs_info','accepted','declined'].includes(app.screening.status));
  const scheduled=app.rounds.some(r=>hasInterviewArrangement(r)||r.scheduleEvents?.some(e=>e.type==='created'));
  return {id:app.id,name:candidates.get(app.candidateId)?.name||'候选人已缺失',job:app.job,ownerId:owner.id,status:app.status,stage:stage.name,tone:stage.tone,created,lastAt:times.length?new Date(Math.max(...times)).toISOString():null,
   sent,bookingHours,reached:{created:true,scheduled,submitted:submitted.length>0,passed:submitted.some(r=>r.feedback.conclusion==='建议通过'),hired:app.status==='公司决定录用',offered:!!offer?.issued,offerAccepted:offer?.response==='accepted',joined:!!offer?.joined},
   passed:submitted.filter(r=>r.feedback.conclusion==='建议通过').length,failed:submitted.filter(r=>r.feedback.conclusion==='建议不通过').length,
   cycleHours:app.status==='进行中'||recruitmentTime(app.endedAt)===null||recruitmentTime(created)===null||recruitmentTime(app.endedAt)<recruitmentTime(created)?null:(recruitmentTime(app.endedAt)-recruitmentTime(created))/3600000,
   events,screening:app.screening?{status:app.screening.status,reviewedAt:app.screening.reviewedAt}:null,
   rounds:app.rounds.map(r=>({name:r.name,time:r.time,mode:r.mode,specialRecordedAt:r.specialRecordedAt,cancelled:!!r.cancelled,status:r.feedback.status,conclusion:r.feedback.status==='submitted'?r.feedback.conclusion:null,submittedAt:r.feedback.status==='submitted'?r.feedback.submittedAt:null}))};
 });
 function summary(list){
  const cycles=list.map(r=>r.cycleHours).filter(n=>n!==null);
  const passed=list.reduce((n,r)=>n+r.passed,0),failed=list.reduce((n,r)=>n+r.failed,0);
  const count=predicate=>list.filter(predicate).length;
  const resumePassed=count(r=>r.screening?.status==='accepted'),resumeFailed=count(r=>r.screening?.status==='declined');
  return {
   created:list.length,jobs:new Set(list.map(r=>r.job)).size,
   ongoing:count(r=>r.status==='进行中'),hired:count(r=>r.reached.hired),
   terminated:count(r=>!['进行中','公司决定录用'].includes(r.status)),exited:count(r=>r.status==='候选人退出'),
   submitted:count(r=>r.reached.submitted),passed,failed,passRate:passed+failed?passed/(passed+failed):null,
   resumePassed,resumeFailed,sent:count(r=>r.sent),sentScheduled:count(r=>r.sent&&r.reached.scheduled),
   bookingSamples:count(r=>r.bookingHours!==null),bookingOnTime:count(r=>r.bookingHours!==null&&r.bookingHours<=24),
   cycleHours:cycles.length?cycles.reduce((a,b)=>a+b,0)/cycles.length:null,cycleSamples:cycles.length
  };
 }
 return {summary:summary(rows),people:people.map(p=>({id:p.id,name:p.name,role:p.role,frozen:!!p.frozen,...summary(rows.filter(r=>r.ownerId===p.id))})),jobs:[...new Set(rows.map(r=>r.job))].map(job=>({job,...summary(rows.filter(r=>r.job===job))})),funnel:stages.map(([key,name],i)=>{const members=rows.filter(r=>r.reached[key]),previous=i?rows.filter(r=>r.reached[stages[i-1][0]]):[];return {key,name,count:members.length,conversion:i&&previous.length&&members.every(r=>r.reached[stages[i-1][0]])?members.length/previous.length:null};}),records:rows};
}

export function mountRecruitmentDashboard(app,{loadSnapshot}){
 app.get('/api/recruitment-dashboard',async(req,res)=>{
  if(!['admin','HR'].includes(req.user?.role))return res.status(403).json({error:'无权查看招聘大盘'});
  const {state,users}=await loadSnapshot();res.json(buildRecruitmentDashboard(state,users,req.user,req.query));
 });
 app.get('/api/admin/recruitment-dashboard',async(req,res)=>{
  if(!canManageAccounts(req.user))return res.status(403).json({error:'仅管理员可查看招聘大盘'});
  const {state,users}=await loadSnapshot();res.json(buildRecruitmentDashboard(state,users,req.user,req.query));
 });
}
