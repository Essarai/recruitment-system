import React,{useState} from 'react';
import {pendingHRDecision} from './round-review';
import {TranscriptLink} from './TranscriptLink';

export function HRDecisionPanel({app,readOnly,open}){
 const pending=pendingHRDecision(app);if(!pending)return null;
 const {source,next}=pending;
 return <section className="hr-decision-panel" aria-label="HR 后续安排"><div><small>当前需要 HR 处理</small><h2>{source.name} · {source.feedback.conclusion==='待定'?'结论待定':'建议加面'}</h2><p>本轮面评已提交。{readOnly?'等待发起 HR 决定后续安排。':'请查看面评后决定后续安排；暂不处理将保留当前应聘。'}</p></div>{!readOnly&&<div className="actions">{next&&<button className="primary" onClick={()=>open('progressInterview',{appId:app.id,roundId:source.id,action:'next'})}>推进{next.name}</button>}<button onClick={()=>open('progressInterview',{appId:app.id,roundId:source.id,action:'additional'})}>追加面试</button><button className="text-button" onClick={()=>open('end',{appId:app.id})}>结束流程</button></div>}</section>;
}

export function HRProgressionForm({app,sourceRoundId,action,people,busy,error,onSave,close}){
 const pending=pendingHRDecision(app),source=pending?.source,next=pending?.next;
 const active=people.filter(p=>p.role==='interviewer'&&!p.frozen).map(p=>p.name);
 const [interviewer,setInterviewer]=useState(action==='next'&&active.includes(next?.interviewer)?next.interviewer:''),[reason,setReason]=useState(''),[name,setName]=useState(`${source?.name||''}加面`);
 if(!source||source.id!==sourceRoundId)return <div className="error" role="alert">当前轮次已变化，请关闭后刷新重试。</div>;
 const target=action==='next'?next?.name:name;
 return <form className="hr-progression-form" onSubmit={e=>{e.preventDefault();onSave(app.id,{sourceRoundId,action,interviewer,reason,name});}}>
  <section className="hr-progression-feedback" aria-label="原正式面评"><div className="section-heading"><h3>{source.name} · 原正式面评</h3><span className="stage-label stage-pending">{source.feedback.conclusion}</span></div><p>{source.feedback.summary||'未记录综合评价'}</p><details><summary>查看完整面评</summary>{source.feedback.strengths&&<p>优势：{source.feedback.strengths}</p>}{source.feedback.concerns&&<p>待验证：{source.feedback.concerns}</p>}{source.feedback.transcript&&<p><TranscriptLink file={source.feedback.transcript}/></p>}<small>{source.feedback.author||source.interviewer} · {source.feedback.submittedAt?new Date(source.feedback.submittedAt).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false}):'提交时间未记录'}</small></details></section>
  {action==='additional'&&<label className="field"><span>加面名称 *</span><input required maxLength={100} value={name} onChange={e=>setName(e.target.value)}/></label>}
  <label className="field"><span>{action==='next'?next?.name:'加面'}审核面试官 *</span><select required value={interviewer} onChange={e=>setInterviewer(e.target.value)}><option value="">请选择面试官</option>{active.map(p=><option key={p}>{p}</option>)}</select></label>
  {!active.length&&<p className="warning">暂无启用的面试官，请联系管理员配置。</p>}
  <label className="field"><span>推进说明 *</span><textarea required rows={4} maxLength={2000} value={reason} onChange={e=>setReason(e.target.value)} placeholder="说明本轮待定或建议加面后，继续推进的依据及需验证的问题"/></label>
  <p className="info">确认后发起{target||'新一轮'}简历审核，面试官通过后才能约面。原正式面评保留为“{source.feedback.conclusion}”，本次决定将记录在操作历史中。</p>
  <footer className="dialog-footer editor-footer">{error&&<div className="error" role="alert">{error}</div>}<button type="button" onClick={close} disabled={busy}>关闭</button><button className="primary" type="submit" disabled={busy||!active.length}>{busy?'正在发起…':'确认并发起简历审核'}</button></footer>
 </form>;
}
