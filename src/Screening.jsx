import {PaginatedList} from './PaginatedList';
import {ResumeLink} from './ResumeLink';
import React from 'react';
import {needsScreening} from './model';
export function ScreeningPanel({app,open}){
 if(!needsScreening(app))return null;
 const s=app.screening,status=s?.status||'unassigned';
 const labels={unassigned:'待推送简历',pending:'等待面试官确认',accepted:'面试官已接受',declined:'简历筛选不通过'};
 return <section className="screening-panel" aria-label="首轮简历确认"><div><h2>首轮简历确认</h2><p><span className={`stage-label stage-${status==='accepted'?'success':status==='declined'?'danger':'pending'}`}>{labels[status]}</span>{s?.interviewer&&<span className="screening-person">{s.interviewer}</span>}</p><p className="muted">{status==='accepted'?'可协调候选人与面试官的时间，再安排首轮会议。':status==='declined'?`不通过原因：${s.reason}`:'业务面试官接受简历后，HR 再协调时间、创建会议。'}</p></div>{app.status==='进行中'&&!app.rounds[0]?.time&&<button onClick={()=>open('screening',{appId:app.id})}>{status==='unassigned'?'推送简历':'更换确认人'}</button>}</section>;
}
export function ScreeningQueue({data,person,query,accept,decline,busy}){
 const apps=data.applications.filter(a=>{const c=data.candidates.find(c=>c.id===a.candidateId);return `${c.name} ${c.phone} ${c.email}`.toLowerCase().includes(query.toLowerCase())&&a.status==='进行中'&&a.screening?.interviewer===person&&(a.screening.status==='pending'||a.screening.status==='accepted'&&!a.rounds.some(r=>r.time));});
 if(!apps.length)return null;
 return <section className="screening-queue" aria-label="首轮推荐简历"><div className="section-heading"><h2>首轮推荐简历</h2><span className="muted">接受后由 HR 协调时间并安排会议</span></div><PaginatedList items={apps} resetKey={query} label="首轮推荐简历">{rows=>rows.map(a=>{const c=data.candidates.find(c=>c.id===a.candidateId);return <article className="interview" key={a.id}><div><h3>{c.name} <span className="muted">{a.job}</span></h3><p>{[c.education,c.experience,c.city].filter(Boolean).join(' · ')}</p><p className="muted">{a.screening.status==='pending'?'待你确认是否参加首轮面试':'已接受，等待 HR 安排面试'}</p></div><div className="actions"><ResumeLink app={a}>查看简历</ResumeLink>{a.screening.status==='pending'&&<><button disabled={busy} onClick={()=>decline(a.id)}>不通过</button><button className="primary" disabled={busy} onClick={()=>accept(a.id)}>接受面试</button></>}</div></article>;})}</PaginatedList></section>;
}
