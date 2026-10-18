import React from 'react';
import {needsScreening} from './model';
export function ScreeningPanel({app,open}){
 if(!needsScreening(app))return null;
 const s=app.screening,status=s?.status||'unassigned';
 const labels={unassigned:'待推送简历',pending:'等待面试官确认',accepted:'面试官已接受',declined:'简历筛选不通过'};
 return <section className="screening-panel" aria-label="首轮简历确认"><div><h2>首轮简历确认</h2><p><span className={`stage-label stage-${status==='accepted'?'success':status==='declined'?'danger':'pending'}`}>{labels[status]}</span>{s?.interviewer&&<span className="screening-person">{s.interviewer}</span>}</p><p className="muted">{status==='accepted'?'可协调候选人与面试官的时间，再安排首轮会议。':status==='declined'?`不通过原因：${s.reason}`:'业务面试官接受简历后，HR 再协调时间、创建会议。'}</p></div>{app.status==='进行中'&&!app.rounds[0]?.time&&<button onClick={()=>open('screening',{appId:app.id})}>{status==='unassigned'?'推送简历':'更换确认人'}</button>}</section>;
}
