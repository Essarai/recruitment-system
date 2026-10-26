export function upcomingInterviewGroups(groups){
 return groups.filter(group=>group.upcoming.length).sort((a,b)=>new Date(a.upcoming[0].round.time)-new Date(b.upcoming[0].round.time));
}

export function interviewGroups(data,person,query='',now=Date.now()){
 const groups=[];
 for(const candidate of data.candidates){
  if(!`${candidate.name} ${candidate.phone||''} ${candidate.email||''}`.toLowerCase().includes(query.trim().toLowerCase()))continue;
  const applications=data.applications.filter(a=>a.candidateId===candidate.id).map(app=>({
   app,rounds:app.rounds.filter(r=>(r.time&&r.interviewer===person)||(r.review?.interviewer===person&&['pending','accepted'].includes(r.review.status)&&app.status==='进行中')),
   screening:app.status==='进行中'&&app.screening?.interviewer===person&&['pending','accepted'].includes(app.screening.status)
  })).filter(item=>item.screening||item.rounds.length);
  if(!applications.length)continue;
  const rounds=applications.flatMap(item=>item.rounds),tasks=[],upcoming=[];
  for(const {app,rounds,screening} of applications){
   if(screening&&app.screening.status==='pending')tasks.push({kind:'screening',app});
   for(const round of rounds){
    if(app.status==='进行中'&&round.review?.status==='pending'&&round.review.interviewer===person&&!round.cancelled)tasks.push({kind:'roundReview',app,round});
    if(!round.time)continue;
    if(round.cancelled||round.feedback.status==='submitted')continue;
    if(['returned','draft'].includes(round.feedback.status)||new Date(round.time).getTime()<=now)tasks.push({kind:'feedback',app,round});
    if(app.status==='进行中'&&new Date(round.time).getTime()+60*60*1000>now)upcoming.push({kind:'upcoming',app,round,completed:now>=new Date(round.time).getTime()+10*60*1000});
   }
  }
  upcoming.sort((a,b)=>new Date(a.round.time)-new Date(b.round.time));
  const reviews=tasks.filter(t=>['screening','roundReview'].includes(t.kind)).length,feedback=tasks.length-reviews;
  const waiting=applications.filter(item=>item.screening&&item.app.screening.status==='accepted'&&!item.app.screening.interviewsScheduled&&!item.app.rounds.some(r=>r.time)||item.rounds.some(r=>r.review?.status==='accepted'&&!r.time&&!r.cancelled)).length;
  groups.push({candidate,applications,roundCount:rounds.filter(r=>r.time).length,reviews,feedback,waiting,tasks,upcoming});
 }
 return groups.sort((a,b)=>Number(!!(b.reviews||b.feedback))-Number(!!(a.reviews||a.feedback)));
}
