import React from 'react';
import expandIcon from '@material-design-icons/svg/outlined/expand_more.svg';
import dotIcon from '@material-design-icons/svg/filled/fiber_manual_record.svg';
import activeDotIcon from '@material-design-icons/svg/outlined/fiber_manual_record.svg';
import chevronIcon from '@material-design-icons/svg/outlined/chevron_right.svg';
import {applicationStage,applicationProgress,educationOptions,nextInterview} from './model';
import {applicationWait} from './application-wait';
import {applicationCreatorName} from './permissions';
export function MobileApplications({rows,data,now,select,date}){
 return <div className="mobile-applications">{rows.map((app,index)=><MobileApplication key={app.id} app={app} candidate={data.candidates.find(c=>c.id===app.candidateId)} users={data.users} now={now} select={select} date={date} initialExpanded={index===0}/>)}</div>;
}
function MobileApplication({app,candidate:c,users,now,select,date,initialExpanded}){
 const stage=applicationStage(app,now),steps=applicationProgress(app),wait=applicationWait(app,now),next=nextInterview(app);
 const status=stage.round&&stage.round.review?.status!=='needs_info'&&!stage.awaitingHR?stage.name+' · '+(stage.round.review?.status==='pending'?'待审核简历':stage.detail.split(' · ').slice(1).join(' · ')):stage.name;
 return <article className="mobile-application" aria-label={c.name+'的应聘'}>
  <div className="mobile-record-heading"><button className="name-link" onClick={()=>select(app.id)}>{c.name}</button><button className="text-button" onClick={()=>select(app.id)}>查看详情<img src={chevronIcon} alt=""/></button></div>
  <div className="mobile-record-secondary"><p className="mobile-record-profile">{[app.job,c.age?c.age+'岁':'',educationOptions.includes(c.education)?c.education:''].filter(Boolean).join(' · ')}</p>{next&&<p className="mobile-record-appointment">{date(next.time)}</p>}</div>
  <div className="mobile-record-status"><span data-tone={stage.tone}><img src={dotIcon} alt=""/>{status}</span><small className="application-wait" title={wait?'从'+(wait.source==='application'?'创建应聘':wait.roundName+'排期结束')+'开始计算'+(wait.source==='interview'?'；面试结束按排期估算':''):'尚无可计算的等待时间'}>已等待 {wait?.text||'—'}</small></div>
  <details className="mobile-record-progress" open={initialExpanded}>
   <summary><span className="mobile-record-creator">发起人：{applicationCreatorName(app,users)}</span><span className="mobile-progress-toggle"><span className="expand-label">展开进度</span><span className="collapse-label">收起进度</span><img src={expandIcon} alt=""/></span></summary>
   <div className="application-progress" data-tone={stage.tone}><div className="progress-steps" role="progressbar" aria-label={c.name+'的应聘进度'} aria-valuemin={0} aria-valuemax={steps.length} aria-valuenow={steps.filter(s=>s.done).length} aria-valuetext={steps.map(s=>s.name+'：'+(s.done?'已完成':s.active?'处理中':'未完成')).join('；')}>{steps.map(step=><div key={step.id} className="progress-step" data-tone={step.tone} data-result={step.id==='result'} data-state={step.done?'done':step.active?'active':'waiting'}><span className="progress-track"/><img className="mobile-step-dot" src={step.active?activeDotIcon:dotIcon} alt=""/><small>{step.id==='screening'?'简历':step.name}</small></div>)}</div></div>
  </details>
 </article>;
}
