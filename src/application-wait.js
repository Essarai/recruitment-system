import {appointmentTime} from './availability.js';
export function applicationWait(app,now=Date.now()){
 const until=app.status==='进行中'?now:Date.parse(app.endedAt);
 if(!Number.isFinite(until))return null;
 const completed=app.rounds.filter(r=>r.time&&!r.cancelled).map(r=>({round:r,end:appointmentTime(r.time)+(Number.isFinite(r.duration)&&r.duration>0?r.duration:60)*60000})).filter(r=>Number.isFinite(r.end)&&r.end<=until).sort((a,b)=>b.end-a.end)[0];
 if(!completed)return null;
 const minutes=Math.floor((until-completed.end)/60000),hours=Math.floor(minutes/60),days=Math.floor(hours/24);
 return {since:completed.end,roundName:completed.round.name,text:minutes<1?'不足1分钟':minutes<60?`${minutes}分钟`:hours<24?`${hours}小时${minutes%60?`${minutes%60}分钟`:''}`:`${days}天${hours%24?`${hours%24}小时`:''}`};
}
