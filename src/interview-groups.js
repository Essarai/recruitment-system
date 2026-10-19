export const interviewDay=value=>{const date=new Date(value);return Number.isFinite(date.getTime())?new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(date):'';};
export function interviewGroups(data,person,query='',now=Date.now(),filters={}){
 const groups=[];
 for(const candidate of data.candidates){
  if(!`${candidate.name} ${candidate.phone||''} ${candidate.email||''} ${candidate.company||''} ${candidate.currentTitle||''} ${data.applications.filter(a=>a.candidateId===candidate.id).map(a=>a.job).join(' ')}`.toLowerCase().includes(query.trim().toLowerCase()))continue;
  const applications=data.applications.filter(a=>a.candidateId===candidate.id&&(!filters.job||a.job===filters.job)).map(app=>({
   app,rounds:app.rounds.filter(r=>{
    if(!r.time||r.interviewer!==person||filters.round&&r.name!==filters.round)return false;
    const day=interviewDay(r.time);if(filters.from&&day<filters.from||filters.to&&day>filters.to)return false;
    if(filters.status==='review')return false;
    if(filters.status==='feedback')return !r.cancelled&&r.feedback.status!=='submitted'&&(['draft','returned'].includes(r.feedback.status)||new Date(r.time).getTime()<=now);
    if(filters.status==='scheduled')return app.status==='进行中'&&!r.cancelled&&r.feedback.status!=='submitted'&&new Date(r.time).getTime()+3600000>now;
    if(filters.status==='submitted')return r.feedback.status==='submitted';
    return true;
   }),
   screening:!filters.round&&!filters.from&&!filters.to&&(!filters.status||filters.status==='review')&&app.status==='进行中'&&app.screening?.interviewer===person&&(filters.status==='review'?app.screening.status==='pending':['pending','accepted'].includes(app.screening.status))
  })).filter(item=>item.screening||item.rounds.length);
  if(!applications.length)continue;
  const rounds=applications.flatMap(item=>item.rounds),tasks=[],upcoming=[],today=[];
  for(const {app,rounds,screening} of applications){
   if(screening&&app.screening.status==='pending')tasks.push({kind:'screening',app});
   for(const round of rounds){
    if(round.cancelled||round.feedback.status==='submitted')continue;
    if(['returned','draft'].includes(round.feedback.status)||new Date(round.time).getTime()<=now)tasks.push({kind:'feedback',app,round});
    if(app.status==='进行中'&&interviewDay(round.time)===interviewDay(now))today.push({kind:'upcoming',app,round});
    if(app.status==='进行中'&&new Date(round.time).getTime()+60*60*1000>now)upcoming.push({kind:'upcoming',app,round});
   }
  }
  tasks.sort((a,b)=>Number(b.kind==='feedback')-Number(a.kind==='feedback')||(a.round?new Date(a.round.time).getTime():0)-(b.round?new Date(b.round.time).getTime():0));
  today.sort((a,b)=>new Date(a.round.time)-new Date(b.round.time));
  upcoming.sort((a,b)=>new Date(a.round.time)-new Date(b.round.time));
  const reviews=tasks.filter(t=>t.kind==='screening').length,feedback=tasks.length-reviews;
  const waiting=applications.filter(item=>item.screening&&item.app.screening.status==='accepted'&&!item.app.screening.interviewsScheduled&&!item.app.rounds.some(r=>r.time)).length;
  groups.push({candidate,applications,roundCount:rounds.length,reviews,feedback,waiting,tasks,upcoming,today});
 }
 return groups.sort((a,b)=>Number(!!b.feedback)-Number(!!a.feedback)||Number(!!b.reviews)-Number(!!a.reviews)||(a.tasks[0]?.round&&b.tasks[0]?.round?new Date(a.tasks[0].round.time)-new Date(b.tasks[0].round.time):0));
}
