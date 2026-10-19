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
const phases={review:{name:'待确认简历',party:'面试官'},schedule:{name:'待 HR 安排',party:'HR'},feedback:{name:'待提交面评',party:'面试官'},decision:{name:'待最终决策',party:'HR'},interview:{name:'待面试',party:'按计划进行'}};
function currentPhase(app,created,now){
 if(app.status!=='进行中')return null;
 const screening=app.screening;
 if(screening?.status==='pending')return {key:'review',round:'简历确认',since:screening.sentAt,clock:'距推送简历'};
 if(screening&&screening.status!=='skipped'&&screening.status!=='accepted')return {key:'schedule',round:'待指定简历确认人',since:created,clock:'距创建应聘'};
 const index=app.rounds.findIndex(r=>r.feedback.status!=='submitted');
 if(index<0){const times=app.rounds.map(r=>recruitmentTime(r.feedback.submittedAt)).filter(v=>v!==null);return {key:'decision',round:'所有轮次面评已交',since:times.length?Math.max(...times):null,clock:'距最后面评提交'};}
 const round=app.rounds[index],time=recruitmentTime(round.time);
 if(round.cancelled||time===null){const cancellation=[...(round.scheduleEvents||[])].reverse().find(e=>e.type==='cancelled');return {key:'schedule',round:round.name,since:cancellation?.at||(index?app.rounds[index-1].feedback.submittedAt:screening?.reviewedAt||created),clock:'距进入待安排'};}
 if(['draft','returned'].includes(round.feedback.status)||time<=now)return {key:'feedback',round:round.name,since:time,scheduledTime:round.time,clock:'距计划面试时间'};
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
 if(!canManageAccounts(viewer))throw Object.assign(Error('仅管理员可查看招聘大盘'),{status:403});
 const from=String(filters.from||''),to=String(filters.to||''),hr=String(filters.hr||''),job=String(filters.job||'');
 if((from&&!validDate(from))||(to&&!validDate(to))||(from&&to&&from>to))throw Object.assign(Error('请选择有效且顺序正确的日期范围'),{status:400});
 if(hr.length>80||job.length>160)throw Object.assign(Error('筛选条件无效'),{status:400});
 const inPeriod=value=>{const day=recruitmentDay(value);return !from&&!to||!!day&&(!from||day>=from)&&(!to||day<=to);};
 const candidates=new Map(state.candidates.map(c=>[c.id,c])),nowTime=recruitmentTime(now),people=users.filter(u=>['HR','admin'].includes(u.role));
 const records=state.applications.map(app=>({app,owner:ownerOf(app,people),created:recruitmentTime(creation(app)?.at)!==null?creation(app).at:null})).filter(r=>(!hr||r.owner.id===hr)&&(!job||r.app.job===job));
 const cohort=records.filter(r=>inPeriod(r.created)),ended=records.filter(r=>r.app.status!=='进行中'&&inPeriod(r.app.endedAt));
 const groups=new Map(people.filter(u=>!hr||u.id===hr).map(u=>[u.id,{id:u.id,name:u.name,role:u.role,frozen:!!u.frozen,imported:0,created:0,ongoing:0,waitHR:0,waitInterviewer:0,hired:0,terminated:0}]));
 function group(owner){if(!groups.has(owner.id))groups.set(owner.id,{id:owner.id,name:owner.name,role:owner.role,imported:0,created:0,ongoing:0,waitHR:0,waitInterviewer:0,hired:0,terminated:0});return groups.get(owner.id);}
 const current=Object.fromEntries(Object.keys(phases).map(key=>[key,0])),queue=[],outcomes=Object.fromEntries(Object.keys(outcomeNames).map(key=>[key,0]));
 const coverage={creationTime:records.filter(r=>!r.created).length,owner:records.filter(r=>r.owner.id==='unassigned').length,endTime:records.filter(r=>r.app.status!=='进行中'&&recruitmentTime(r.app.endedAt)===null).length,legacyScheduledRounds:0,unknownImports:state.candidates.filter(c=>!c.createdBy||recruitmentTime(c.createdAt)===null).length};
 for(const record of records){const {app,owner,created}=record,phase=currentPhase(app,created,nowTime);if(!phase)continue;
  const entry=group(owner);entry.ongoing++;current[phase.key]++;if(['schedule','decision'].includes(phase.key))entry.waitHR++;if(['review','feedback'].includes(phase.key))entry.waitInterviewer++;
  const waitHours=duration(phase.since,nowTime);queue.push({id:app.id,candidateName:candidates.get(app.candidateId)?.name||'候选人已缺失',job:app.job,owner:owner.name,ownerId:owner.id,phase:phase.key,phaseName:phases[phase.key].name,party:phases[phase.key].party,round:phase.round,waitHours,clock:phase.clock,scheduledTime:phase.scheduledTime||null});
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
  if(app.screening?.status==='accepted')accepted++;else if(app.screening?.status==='declined')declined++;else if(app.screening?.status==='skipped'||!app.screening&&app.rounds.some(r=>r.time))skipped++;else pendingReview++;
  if(app.rounds.some(r=>r.time))scheduled++;if(app.status==='公司决定录用')hired++;if(app.status==='进行中')cohortOngoing++;
  app.rounds.forEach((r,index)=>{if(r.feedback.status!=='submitted')return;const key=`${index}:${r.name}`;if(!roundResults.has(key))roundResults.set(key,{key,index:index+1,name:r.name,passed:0,failed:0,additional:0,undecided:0,unknown:0});const row=roundResults.get(key);row[{'建议通过':'passed','建议不通过':'failed','建议加面':'additional','待定':'undecided'}[r.feedback.conclusion]||'unknown']++;});
 }
 queue.sort((a,b)=>Number(a.phase==='interview')-Number(b.phase==='interview')||(b.waitHours??-1)-(a.waitHours??-1));
 return {generatedAt:new Date(nowTime).toISOString(),filters:{from,to,hr,job},overview:{created:cohort.length,ongoing:queue.length,hired:outcomes.hired,terminated:ended.length-outcomes.hired,imports:job?null:[...groups.values()].reduce((sum,g)=>sum+g.imported,0)},current:Object.entries(phases).map(([key,phase])=>({key,...phase,count:current[key]})),outcomes:Object.entries(outcomeNames).map(([key,name])=>({key,name,count:outcomes[key]})),hrRows:[...groups.values()].sort((a,b)=>a.name.localeCompare(b.name,'zh-CN')),operations:{...operationCounts,people:[...operationPeople.values()].sort((a,b)=>a.name.localeCompare(b.name,'zh-CN'))},conversion:{cohort:cohort.length,accepted,declined,pendingReview,skipped,scheduled,hired,ongoing:cohortOngoing},rounds:[...roundResults.values()].sort((a,b)=>a.index-b.index||a.name.localeCompare(b.name,'zh-CN')),efficiency:Object.entries(times).map(([key,values])=>({key,samples:values.length,medianHours:median(values)})),coverage,queue};
}

export function mountRecruitmentDashboard(app,{loadSnapshot}){
 app.get('/api/admin/recruitment-dashboard',async(req,res)=>{
  if(!canManageAccounts(req.user))return res.status(403).json({error:'仅管理员可查看招聘大盘'});
  const {state,users}=await loadSnapshot();res.json(buildRecruitmentDashboard(state,users,req.user,req.query));
 });
}
