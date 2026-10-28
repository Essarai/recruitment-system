import {canReadInitialReview} from './resume-review.js';
import {applicationStatus} from './model.js';
export const interviewProgressFilters=[['review','简历待确认'],['needs_info','待 HR 补充'],['schedule','待 HR 排期'],['interview','待面试'],['feedback','待提交面评'],['submitted','面评已提交']];
export function filterInterviewGroups(groups,{progress='',job='',round='',result=''}={},now=Date.now()){
 return groups.filter(group=>group.applications.some(item=>{
  const {app}=item;if(job&&app.job!==job||result&&applicationStatus(app)!==result)return false;
  const screening=item.screening&&(!round||round==='screening'),rounds=round==='screening'?[]:item.rounds.filter(r=>!round||'round:'+r.name===round);
  if(round&&!screening&&!rounds.length)return false;
  const active=app.status==='进行中'&&!app.withdrawnAt;
  switch(progress){
   case '':return true;
   case 'review':return active&&(screening&&app.screening.status==='pending'||rounds.some(r=>!r.cancelled&&r.review?.status==='pending'));
   case 'needs_info':return active&&(screening&&app.screening.status==='needs_info'||rounds.some(r=>!r.cancelled&&r.review?.status==='needs_info'));
   case 'schedule':return active&&(screening&&app.screening.status==='accepted'&&!app.screening.interviewsScheduled&&!item.rounds.some(r=>r.time)||rounds.some(r=>!r.cancelled&&!r.time&&r.review?.status==='accepted'));
   case 'interview':return active&&rounds.some(r=>!r.cancelled&&r.time&&r.feedback.status!=='submitted'&&new Date(r.time).getTime()>now);
   case 'feedback':return !app.withdrawnAt&&rounds.some(r=>!r.cancelled&&r.time&&r.feedback.status!=='submitted'&&(['draft','returned'].includes(r.feedback.status)||new Date(r.time).getTime()<=now));
   case 'submitted':return rounds.some(r=>r.feedback.status==='submitted');
   default:return false;
  }
 }));
}
export function upcomingInterviewGroups(groups){
 return groups.filter(group=>group.upcoming.length).sort((a,b)=>new Date(a.upcoming[0].round.time)-new Date(b.upcoming[0].round.time));
}

export function interviewGroups(data,person,query='',now=Date.now()){
 const groups=[];
 for(const candidate of data.candidates){
  if(!`${candidate.name} ${candidate.phone||''} ${candidate.email||''}`.toLowerCase().includes(query.trim().toLowerCase()))continue;
  // The server already filters rounds; the preceding interview is intentionally hidden here.
  const applications=data.applications.filter(a=>a.candidateId===candidate.id).map(app=>({
   app,rounds:app.rounds.filter(r=>(r.time&&r.interviewer===person)||(r.interviewer===person&&r.review?.interviewer===person&&(app.status==='进行中'&&r.review.status==='pending'||['accepted','declined','needs_info'].includes(r.review.status)))),
   screening:canReadInitialReview(app,person)
  })).filter(item=>item.screening||item.rounds.length);
  if(!applications.length)continue;
  const rounds=applications.flatMap(item=>item.rounds),tasks=[],upcoming=[];
  for(const {app,rounds,screening} of applications){
   if(app.status==='进行中'&&screening&&app.screening.status==='pending')tasks.push({kind:'screening',app});
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
  const waiting=applications.filter(item=>item.app.status==='进行中'&&(item.screening&&item.app.screening.status==='accepted'&&!item.app.screening.interviewsScheduled&&!item.app.rounds.some(r=>r.time)||item.rounds.some(r=>r.review?.status==='accepted'&&!r.time&&!r.cancelled))).length;
  const waitingInfo=applications.some(item=>item.app.status==='进行中'&&(item.screening&&item.app.screening.status==='needs_info'||item.rounds.some(r=>r.review?.status==='needs_info'&&!r.cancelled)));
  groups.push({candidate,applications,roundCount:rounds.filter(r=>r.time).length,reviews,feedback,waiting,waitingInfo,tasks,upcoming});
 }
 return groups.sort((a,b)=>Number(!!(b.reviews||b.feedback))-Number(!!(a.reviews||a.feedback)));
}
