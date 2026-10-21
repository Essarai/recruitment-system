import React,{useState} from 'react';
import {useResumeSearch} from './useResumeSearch';
import {candidateResumes,canCreateApplication,validateHRNotes,templateNodes} from './model';
import {applicationFromCandidate} from './intake';
import {ResumeLink} from './ResumeLink';
export function CreateApplication({canManageTemplates=false,data,candidateId:initialId,role,busy,error,saveProgress,commit,setError,open,close,viewApplication,settings,loadCandidate}){
 const [candidateId,setCandidateId]=useState(initialId||''),[query,setQuery]=useState('');
 const [templateId,setTemplateId]=useState(data.templates[0]?.id||'');
 const people=data.users.filter(u=>u.role==='interviewer'&&!u.frozen).map(u=>u.name);
 const defaultPerson=template=>{const person=template?.reviewer||'';return people.includes(person)?person:'';};
 const [reviewer,setReviewer]=useState(defaultPerson(data.templates[0]));
 const candidate=data.candidates.find(c=>c.id===candidateId),resumes=candidateResumes(candidate,data.applications);
 const [resumeId,setResumeId]=useState(resumes[0]?.id||'');
 let notesError='';if(candidate){try{validateHRNotes(candidate.notes);}catch(e){notesError=e.message;}}
 const active=data.applications.find(a=>a.candidateId===candidateId&&a.status==='进行中');
 const {result,loading:searching,error:searchError,page,setPage}=useResumeSearch(query,data.revision);
 const candidates=result?.items.map(row=>row.candidate)||[];
 if(candidate&&!candidates.some(c=>c.id===candidate.id))candidates.unshift(candidate);
 const template=data.templates.find(t=>t.id===templateId);
 return <form onSubmit={async e=>{e.preventDefault();setError('');try{const next=structuredClone(data);next.applications.unshift(applicationFromCandidate(data,{candidateId,templateId,resumeId,reviewer},role));await commit(next,reviewer?'应聘已创建，已加入确认人的待办':'应聘已创建，无需简历确认，可直接安排面试');}catch(e){setError(e.message);}}}>
  <p className="muted">从简历库选择候选人，选择本次简历版本和招聘流程后创建应聘。候选人资料和历史记录保持不变。</p>
  <label className="field"><span>查找候选人</span><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="搜索姓名、手机号或邮箱"/></label>
  <label className="field"><span>候选人 *</span><select required value={candidateId} disabled={busy} onChange={async e=>{const id=e.target.value;setError('');if(!id){setCandidateId('');setResumeId('');return;}try{const loaded=await loadCandidate(id);setCandidateId(id);setResumeId(candidateResumes(loaded.candidates.find(c=>c.id===id),loaded.applications)[0]?.id||'');}catch(e){setError(e.message);}}}><option value="">请选择简历库中的候选人</option>{candidates.map(c=><option key={c.id} value={c.id}>{c.name} · {c.phone||c.email}{!canCreateApplication(data.applications,c.id)?' · 已有进行中的应聘':''}</option>)}</select></label>
  {searching&&<p className="muted" role="status">正在查找候选人…</p>}{searchError&&<p className="error">{searchError}</p>}{result&&result.pages>1&&<div className="actions"><button type="button" disabled={searching||page===1} onClick={()=>setPage(page-1)}>上一页候选人</button><small>{page} / {result.pages} · 共 {result.total} 人</small><button type="button" disabled={searching||page===result.pages} onClick={()=>setPage(page+1)}>下一页候选人</button></div>}
  <p className="muted">{!searching&&!candidates.length?'未找到候选人。':''}尚未入库？<button type="button" className="text-button" onClick={()=>open('import',{resumeApplication:true})}>前往导入简历</button></p>
  {active?<div className="info">该候选人正在应聘「{active.job}」，不能重复创建。<button className="text-button" type="button" onClick={()=>viewApplication(active.id)}>查看当前应聘详情</button></div>:candidate&&<>
   {notesError&&<div className="info">{notesError}<button type="button" className="text-button" onClick={()=>open('candidate',{candidateId,resumeApplication:true})}>补充沟通记录</button></div>}
   <p>{candidate.name} · {candidate.education||'学历待补充'} · {candidate.phone||candidate.email}<button type="button" className="text-button" onClick={()=>open('candidate',{candidateId,resumeApplication:true})}>编辑档案后继续</button></p>
   {resumes.length?<><label className="field"><span>本次使用的简历 *</span><select required value={resumeId} onChange={e=>setResumeId(e.target.value)}>{resumes.map((r,i)=><option key={r.id} value={r.id}>{i===0?'最近版本 · ':''}{r.name}</option>)}</select></label><ResumeLink app={{resume:resumes.find(r=>r.id===resumeId)}}>查看所选简历</ResumeLink><p className="muted">复用已有简历，无需重新上传。</p></>:<div className="info">该档案尚无简历附件。<button type="button" className="text-button" onClick={()=>open('candidateResume',{candidateId,resumeApplication:true})}>更新简历后继续</button></div>}
  </>}
  {!data.templates.length?<div className="info">尚未设置招聘流程。{canManageTemplates?<button type="button" className="text-button" onClick={settings}>前往流程设置</button>:'请联系管理员创建流程模板。'}</div>:<><label className="field"><span>应聘岗位／流程 *</span><select required value={templateId} onChange={e=>{setTemplateId(e.target.value);setReviewer(defaultPerson(data.templates.find(t=>t.id===e.target.value)));}}>{data.templates.map(t=><option value={t.id} key={t.id}>{t.name}</option>)}</select></label><p className="muted">{reviewer?'简历确认 → 各轮面试 → 最终结果':'各轮面试 → 最终结果'}</p><div className="template-preview">{templateNodes(template.nodes).map((n,i)=><span key={i}>面试 {i+1}. {n.name} · {n.interviewer||'安排时指定面试官'}</span>)}</div><label className="field"><span>简历确认人（选填）</span><select value={reviewer} onChange={e=>setReviewer(e.target.value)}><option value="">不需要简历确认</option>{people.map(p=><option key={p}>{p}</option>)}</select></label>{!people.length&&<p className="warning">暂无启用的面试官；可先创建应聘，排期前请联系管理员配置账号。</p>}<p className="info">{reviewer?'先由所选确认人审核简历，通过后 HR 可独立指定各轮面试官并安排会议；后续轮次不再确认简历。':'未指定确认人：本次应聘跳过简历确认，创建后 HR 可直接指定面试官并安排会议。'}</p></>}
  <footer className="dialog-footer editor-footer">{error&&<div className="error" role="alert">{error}</div>}<button type="button" onClick={close}>关闭</button><button className="primary" disabled={busy||!candidate||Boolean(notesError)||Boolean(active)||!resumes.length||!template}>{busy?(saveProgress||'保存中…'):reviewer?'创建并发起确认':'创建应聘'}</button></footer>
 </form>;
}
