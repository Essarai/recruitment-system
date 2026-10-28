import React from 'react';
import {needsScreening} from './model';
import {ReviewSupplementHistory} from './ReviewSupplementHistory';
export function ScreeningPanel({app,open,readOnly=false}){
 if(!needsScreening(app))return null;
 const s=app.screening,status=s?.status||'unassigned';
 const labels={unassigned:'待推送简历',pending:'等待简历确认',needs_info:'需 HR 补充',accepted:'简历确认已通过',declined:'简历筛选不通过'};
 return <section className="screening-panel" aria-label="初始简历确认"><div><h2>初始简历确认</h2><p><span className={`stage-label stage-${status==='accepted'?'success':status==='declined'?'danger':'pending'}`}>{labels[status]}</span>{s?.interviewer&&<span className="screening-person">{s.interviewer}</span>}</p><p className="muted">{status==='needs_info'?'补充说明后重新送审，面试官确认通过前不能安排面试。':status==='accepted'?'初始简历确认已通过。后续轮次仍需本轮面试官审核；待定或建议加面由发起 HR 决定后续安排。':status==='declined'?`不通过原因：${s.reason}`:'由指定确认人审核简历，通过后可安排首轮；后续面试仍需逐轮审核。'}</p><ReviewSupplementHistory review={s}/></div>{!readOnly&&app.status==='进行中'&&!app.rounds.some(r=>r.time)&&<button onClick={()=>open(status==='needs_info'?'reviewSupplement':'screening',{appId:app.id})}>{status==='needs_info'?'补充并重新送审':status==='unassigned'?'推送简历':'更换确认人'}</button>}</section>;
}
