import React from 'react';
import {PaginatedList} from './PaginatedList';
import {ResumeLink} from './ResumeLink';
import {applicationStatus,roundTone} from './model';
import {interviewGroups} from './interview-groups';

export function MyInterviews({data,person,query,refresh,open,accept,busy,date,feedbackLabel}){
 const groups=interviewGroups(data,person,query);
 return <section className="my-interviews"><div className="title-row"><div><h1>我的面试</h1><p className="muted">按候选人查看，展开后处理简历确认、各轮面试与面评</p></div><button onClick={refresh}>刷新列表</button></div>
  <PaginatedList items={groups} resetKey={query} label="面试候选人">{rows=>rows.map(group=><details className="interview-candidate" key={group.candidate.id}>
   <summary><div className="interview-candidate-name"><h2>{group.candidate.name}</h2><span className="muted">{[group.candidate.age?`${group.candidate.age}岁`:'',group.candidate.education,group.candidate.currentTitle].filter(Boolean).join(' · ')}</span></div><div className="interview-candidate-counts"><span>{group.applications.length} 次应聘 · {group.roundCount?`${group.roundCount} 轮面试`:'尚未排期'}</span>{group.waiting>0&&<span className="stage-label stage-pending">待 HR 排期</span>}{group.reviews>0&&<span className="stage-label stage-pending">{group.reviews} 份简历待确认</span>}{group.feedback>0&&<span className="stage-label stage-feedback">{group.feedback} 份面评待处理</span>}<span className="expand-hint" aria-hidden="true"/></div></summary>
   <div className="interview-candidate-records">{group.applications.map(({app,rounds,screening})=><section className="interview-application" key={app.id}>
    <div className="interview-application-heading"><div><h3>{app.job}</h3><span className={`stage-label stage-${app.status==='进行中'?'interview':app.status==='公司决定录用'?'success':app.status==='未录用'?'danger':'neutral'}`}>{applicationStatus(app)}</span></div><ResumeLink app={app} className="text-button">查看本次简历</ResumeLink></div>
    {app.jd&&<details className="job-description"><summary>岗位 JD</summary><p>{app.jd}</p></details>}
    {screening&&<div className="interview-child"><div><h3>首轮简历确认</h3><p className="muted">{app.screening.status==='pending'?'待你确认是否参加首轮面试':'已接受，等待 HR 协调时间并安排面试'}</p></div>{app.screening.status==='pending'&&<div className="actions"><button className="text-button" disabled={busy} onClick={()=>open('screeningDecision',{appId:app.id})}>不通过</button><button disabled={busy} onClick={()=>accept(app.id)}>接受面试</button></div>}</div>}
    {rounds.map(r=><article className="interview-child" key={r.id}><div className="interview-child-content"><div className="interview-round-heading"><h3>{r.name}</h3><span className={`stage-label stage-${roundTone(r)}`}>{feedbackLabel(r)}</span></div><p className="muted">{date(r.time)}{r.time&&!r.cancelled&&<> · {r.mode==='线上'?<a href={r.location} target="_blank" rel="noreferrer">加入会议</a>:<>面试地点：{r.location}</>}</>}</p>{r.focus&&<p className="muted">考察重点：{r.focus}</p>}{app.status!=='进行中'&&!r.cancelled&&r.feedback.status!=='submitted'&&<p className="muted">流程已结束，已实际完成的本轮面试仍可补交面评。</p>}</div><div className="actions">{!r.cancelled&&<button className="text-button" onClick={()=>open('feedback',{appId:app.id,roundId:r.id})}>{r.feedback.status==='submitted'?'查看面评':'填写面评'}</button>}</div></article>)}
   </section>)}</div>
  </details>)}</PaginatedList>
  {!groups.length&&<div className="empty">{query?'没有匹配的候选人':'暂无待确认简历或已安排的面试'}</div>}
 </section>;
}
