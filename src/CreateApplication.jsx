import React,{useState} from 'react';
import {candidateResumes,canCreateApplication,templateNodes} from './model';
import {applicationFromCandidate} from './intake';
import {ResumeLink} from './ResumeLink';
export function CreateApplication({data,candidateId:initialId,role,busy,error,saveProgress,commit,setError,open,close,viewApplication,settings}){
 const [candidateId,setCandidateId]=useState(initialId||''),[query,setQuery]=useState('');
 const [templateId,setTemplateId]=useState(data.templates[0]?.id||'');
 const people=data.users.filter(u=>u.role==='interviewer'&&!u.frozen).map(u=>u.name);
 const defaultPerson=template=>{const person=template?templateNodes(template.nodes)[0].interviewer:'';return people.includes(person)?person:'';};
 const [interviewer,setInterviewer]=useState(defaultPerson(data.templates[0]));
 const candidate=data.candidates.find(c=>c.id===candidateId),resumes=candidateResumes(candidate,data.applications);
 const [resumeId,setResumeId]=useState(resumes[0]?.id||'');
 const active=data.applications.find(a=>a.candidateId===candidateId&&a.status==='进行中');
 const candidates=data.candidates.filter(c=>c.id===candidateId||`${c.name} ${c.phone} ${c.email}`.toLowerCase().includes(query.toLowerCase()));
 const template=data.templates.find(t=>t.id===templateId);
 return <form onSubmit={async e=>{e.preventDefault();setError('');try{const next=structuredClone(data);next.applications.unshift(applicationFromCandidate(data,{candidateId,templateId,resumeId,interviewer},role));await commit(next,'应聘已创建，简历已推送给首轮面试官');}catch(e){setError(e.message);}}}>
  <p className="muted">从简历库选择候选人，确认本次简历版本后发起应聘。候选人资料和历史记录保持不变。</p>
  <label className="field"><span>查找候选人</span><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="搜索姓名、手机号或邮箱"/></label>
  <label className="field"><span>候选人 *</span><select required value={candidateId} onChange={e=>{setCandidateId(e.target.value);setResumeId(candidateResumes(data.candidates.find(c=>c.id===e.target.value),data.applications)[0]?.id||'');setError('');}}><option value="">请选择简历库中的候选人</option>{candidates.map(c=><option key={c.id} value={c.id}>{c.name} · {c.phone||c.email}{!canCreateApplication(data.applications,c.id)?' · 已有进行中的应聘':''}</option>)}</select></label>
  <p className="muted">{!candidates.length?'未找到候选人。':''}尚未入库？<button type="button" className="text-button" onClick={()=>open('import',{resumeApplication:true})}>前往导入简历</button></p>
  {active?<div className="info">该候选人正在应聘「{active.job}」，不能重复创建。<button className="text-button" type="button" onClick={()=>viewApplication(active.id)}>查看当前应聘详情</button></div>:candidate&&<>
   <p>{candidate.name} · {candidate.education||'学历待补充'} · {candidate.phone||candidate.email}<button type="button" className="text-button" onClick={()=>open('candidate',{candidateId,resumeApplication:true})}>编辑档案后继续</button></p>
   {resumes.length?<><label className="field"><span>本次使用的简历 *</span><select required value={resumeId} onChange={e=>setResumeId(e.target.value)}>{resumes.map((r,i)=><option key={r.id} value={r.id}>{i===0?'最近版本 · ':''}{r.name}</option>)}</select></label><ResumeLink app={{resume:resumes.find(r=>r.id===resumeId)}}>查看所选简历</ResumeLink><p className="muted">复用已有简历，无需重新上传。</p></>:<div className="info">该档案尚无简历附件。<button type="button" className="text-button" onClick={()=>open('candidateResume',{candidateId,resumeApplication:true})}>更新简历后继续</button></div>}
  </>}
  {!data.templates.length?<div className="info">尚未设置招聘流程。<button type="button" className="text-button" onClick={settings}>前往流程设置</button></div>:<><label className="field"><span>应聘岗位／流程 *</span><select required value={templateId} onChange={e=>{setTemplateId(e.target.value);setInterviewer(defaultPerson(data.templates.find(t=>t.id===e.target.value)));}}>{data.templates.map(t=><option value={t.id} key={t.id}>{t.name}</option>)}</select></label><div className="template-preview">{templateNodes(template.nodes).map((n,i)=><span key={i}>{i+1}. {n.name} · {n.interviewer||'安排时指定面试官'}</span>)}</div><label className="field"><span>首轮业务面试官 *</span><select required value={interviewer} onChange={e=>setInterviewer(e.target.value)}><option value="">请选择</option>{people.map(p=><option key={p}>{p}</option>)}</select></label>{!people.length&&<p className="warning">暂无启用的面试官，请联系管理员配置账号。</p>}<p className="info">创建后推送简历给首轮面试官，待其接受后再由 HR 协调时间、安排会议。</p></>}
  <footer className="dialog-footer editor-footer">{error&&<div className="error" role="alert">{error}</div>}<button type="button" onClick={close}>关闭</button><button className="primary" disabled={busy||!candidate||Boolean(active)||!resumes.length||!template||!people.length}>{busy?(saveProgress||'保存中…'):'创建并推送简历'}</button></footer>
 </form>;
}
