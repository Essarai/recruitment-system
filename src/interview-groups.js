export function interviewGroups(data,person,query='',now=Date.now()){
 const groups=[];
 for(const candidate of data.candidates){
  if(!`${candidate.name} ${candidate.phone||''} ${candidate.email||''}`.toLowerCase().includes(query.trim().toLowerCase()))continue;
  const applications=data.applications.filter(a=>a.candidateId===candidate.id).map(app=>({
   app,rounds:app.rounds.filter(r=>r.time&&r.interviewer===person),
   screening:app.status==='进行中'&&app.screening?.interviewer===person&&['pending','accepted'].includes(app.screening.status)&&!app.rounds.some(r=>r.time)
  })).filter(item=>item.screening||item.rounds.length);
  if(!applications.length)continue;
  const rounds=applications.flatMap(item=>item.rounds);
  const reviews=applications.filter(item=>item.screening&&item.app.screening.status==='pending').length;
  const feedback=rounds.filter(r=>!r.cancelled&&r.feedback.status!=='submitted'&&(r.feedback.status==='returned'||new Date(r.time).getTime()<=now)).length;
  const waiting=applications.filter(item=>item.screening&&item.app.screening.status==='accepted').length;
  groups.push({candidate,applications,roundCount:rounds.length,reviews,feedback,waiting});
 }
 return groups.sort((a,b)=>Number(!!(b.reviews||b.feedback))-Number(!!(a.reviews||a.feedback)));
}
