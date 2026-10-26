import {appointmentTime} from './availability.js';
export function applicationWait(app,now=Date.now()){
 const until=app.status==='进行中'?now:Date.parse(app.endedAt);
 if(!Number.isFinite(until))return null;
 const completed=app.rounds.filter(r=>r.time&&!r.cancelled).map(r=>({round:r,end:appointmentTime(r.time)+(Number.isFinite(r.duration)&&r.duration>0?r.duration:60)*60000})).filter(r=>Number.isFinite(r.end)&&r.end<=until).sort((a,b)=>b.end-a.end)[0];
 const created=!completed&&app.screening?.status==='pending'&&!app.rounds[0]?.time?Math.min(...(app.history||[]).filter(h=>h.action?.startsWith('创建应聘')).map(h=>Date.parse(h.at)).filter(Number.isFinite)):NaN;
 const since=completed?.end??created;
 if(!Number.isFinite(since)||since>until)return null;
 const hours=Math.floor((until-since)/3600000);
 return {since,roundName:completed?.round.name,source:completed?'interview':'application',text:`${hours}小时`};
}
