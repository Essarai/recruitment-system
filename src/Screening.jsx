import React from 'react';
import {needsScreening} from './model';
export function ScreeningPanel({app,open}){
 if(!needsScreening(app))return null;
 const s=app.screening,status=s?.status||'unassigned';
 const labels={unassigned:'待推送简历',pending:'等待简历确认',accepted:'简历确认已通过',declined:'简历筛选不通过'};
 return <section className="screening-panel" aria-label="简历确认（独立节点）"><div><h2>简历确认（独立节点）</h2><p><span className={`stage-label stage-${status==='accepted'?'success':status==='declined'?'danger':'pending'}`}>{labels[status]}</span>{s?.interviewer&&<span className="screening-person">{s.interviewer}</span>}</p><p className="muted">{status==='accepted'?'确认已通过，HR 可分别指定各轮面试官并协调排期。':status==='declined'?`不通过原因：${s.reason}`:'由指定确认人审核简历；确认通过后进入面试安排，后续轮次无需重复确认。'}</p></div>{app.status==='进行中'&&!app.rounds.some(r=>r.time)&&<button onClick={()=>open('screening',{appId:app.id})}>{status==='unassigned'?'推送简历':'更换确认人'}</button>}</section>;
}
