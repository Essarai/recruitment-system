export function interviewGroups(data,person,query='',now=Date.now()){
 const groups=[];
 for(const candidate of data.candidates){
  if(!`${candidate.name} ${candidate.phone||''} ${candidate.email||''}`.toLowerCase().includes(query.trim().toLowerCase()))continue;
  const applications=data.applications.filter(a=>a.candidateId===candidate.id).map(app=>({
   app,rounds:app.rounds.filter(r=>r.time&&r.interviewer===person),
   screening:app.status==='进行中'&&app.screening?.interviewer===person&&['pending','accepted'].includes(app.screening.status)
  })).filter(item=>item.screening||item.rounds.length);
  if(!applications.length)continue;
  const rounds=applications.flatMap(item=>item.rounds),tasks=[],upcoming=[];
  for(const {app,rounds,screening} of applications){
   if(screening&&app.screening.status==='pending')tasks.push({kind:'screening',app});
   for(const round of rounds){
    if(round.cancelled||round.feedback.status==='submitted')continue;
    if(['returned','draft'].includes(round.feedback.status)||new Date(round.time).getTime()<=now)tasks.push({kind:'feedback',app,round});
    if(app.status==='进行中'&&new Date(round.time).getTime()>now)upcoming.push({kind:'upcoming',app,round});
   }
  }
  upcoming.sort((a,b)=>new Date(a.round.time)-new Date(b.round.time));
  const reviews=tasks.filter(t=>t.kind==='screening').length,feedback=tasks.length-reviews;
  const waiting=applications.filter(item=>item.screening&&item.app.screening.status==='accepted'&&!item.app.rounds.some(r=>r.time)).length;
  groups.push({candidate,applications,roundCount:rounds.length,reviews,feedback,waiting,tasks,upcoming});
 }
 return groups.sort((a,b)=>Number(!!(b.reviews||b.feedback))-Number(!!(a.reviews||a.feedback)));
}
