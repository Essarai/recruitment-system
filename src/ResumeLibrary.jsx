import {CandidateBrief} from './CandidateBrief';
import {PaginatedList} from './PaginatedList';
import {ResumeLink} from './ResumeLink';
import React,{useEffect,useId,useRef,useState} from 'react';
import {useResumeSearch} from './useResumeSearch';
import {resumeSearchTerms} from './resume-search';
import {workExperienceLabel,applicationStage,candidateResumes,canCreateApplication,educationOptions,profileFields} from './model';

function CommunicationNote({notes}){
 const id=useId(),content=useRef(null),[expanded,setExpanded]=useState(false),[height,setHeight]=useState(0);
 useEffect(()=>{const element=content.current;const observer=new ResizeObserver(()=>setHeight(element.scrollHeight));observer.observe(element);setHeight(element.scrollHeight);return()=>observer.disconnect();},[notes]);
 return <div className="communication-note"><div id={id} className="communication-note-clip" style={{maxHeight:expanded?Math.max(60,height):60}}><p ref={content}>{notes||'暂无备注'}</p></div>{height>61&&<button type="button" className="text-button communication-note-toggle" aria-expanded={expanded} aria-controls={id} onClick={()=>setExpanded(value=>!value)}>{expanded?'收起':'展开全文'}<span aria-hidden="true" style={{transform:expanded?'rotate(180deg)':undefined}}>⌄</span></button>}</div>;
}

function MoreArchiveActions({children}){
 const id=useId(),menu=useRef(null),[position,setPosition]=useState({left:0,top:0}),[expanded,setExpanded]=useState(false);
 return <><button type="button" className="text-button library-more-trigger" popoverTarget={id} aria-expanded={expanded} aria-controls={id} onClick={e=>{const box=e.currentTarget.getBoundingClientRect(),width=Math.min(400,window.innerWidth-32);setPosition({left:Math.max(16,Math.min(box.right-width,window.innerWidth-width-16)),top:box.bottom+10+90>window.innerHeight?Math.max(16,box.top-90):box.bottom+10});}}>更多操作<span aria-hidden="true">⌄</span></button><div ref={menu} id={id} popover="auto" className="library-more-popover" style={position} onToggle={e=>setExpanded(e.newState==='open')} onClick={e=>{if(e.target.closest('button,a'))menu.current.hidePopover();}}>{children}</div></>;
}

export function ResumeLibrary({data,query,open,archive,onQueryChange=()=>{}}){
 const terms=resumeSearchTerms(query);
 const [size,setSize]=useState(20);
 const {result,loading,error,page,setPage,retry}=useResumeSearch(query,data.revision,size);
 const candidates=result?.items||[];
 function removeTerm(index){onQueryChange(terms.filter((_,i)=>i!==index).map(t=>t.token).join(' + '));}

 return <section className="resume-library">
  <div className="title-row"><div><h1>简历库</h1><p className="muted">顶部支持组合检索，例如“阿里 + 2年经验”；多个条件同时满足。</p></div><button className="primary" onClick={()=>open('import')}>导入简历</button></div>
  {terms.length>0&&<div className="resume-query-summary">{terms.map((term,index)=><button className="search-condition" type="button" key={`${index}-${term.token}`} aria-label={`移除条件 ${term.label}`} onClick={()=>removeTerm(index)}>{term.label}<span aria-hidden="true">×</span></button>)}<small className="muted" role="status">匹配 {result?.total??'…'} / {result?.libraryTotal??'…'} 人</small><button className="text-button" onClick={()=>onQueryChange('')}>清空条件</button></div>}
  {error&&<div className="error" role="alert">{error}<button className="text-button" onClick={retry}>重试</button></div>}
  {loading&&<p className="muted" role="status">正在查询简历…</p>}
  <div className="table-wrap"><table><thead><tr><th>候选人资料</th><th>HR 前置沟通记录</th><th>档案操作</th></tr></thead><tbody>
   {candidates.map(({candidate:c,applicationCount,active,job,stage,files})=>{
    return <tr key={c.id}>
     <td className="library-candidate-details"><div className="candidate-identity"><button className="name-link candidate-name" title={c.name} onClick={()=>archive(c.id)}>{c.name}</button><span className="candidate-application-summary">{applicationCount?<><span title={`投递岗位：${job}`}>投递岗位：{job}</span><span className={`stage-label stage-${stage.tone}`}>{stage.name}</span></>:<span>暂无应聘记录</span>}</span></div><CandidateBrief candidate={c} showNotes={false}/></td>
     <td className="library-notes"><CommunicationNote notes={c.notes}/></td>
     <td><div className="library-actions"><button className="text-button" onClick={()=>archive(c.id)}>查看档案</button><MoreArchiveActions>{files[0]?.id&&<ResumeLink app={{resume:files[0]}} className="text-button">{files[0].name.toLowerCase().endsWith('.pdf')?'预览简历':'下载简历'}</ResumeLink>}<button className="text-button" onClick={()=>open('candidate',{candidateId:c.id})}>编辑资料</button><button className="text-button" onClick={()=>open('candidateResume',{candidateId:c.id})}>更新简历</button>{!active&&<button className="text-button" onClick={()=>open('createApplication',{candidateId:c.id})}>{applicationCount?'重新捞起':'创建应聘'}</button>}</MoreArchiveActions></div><small className="sub library-version-count">{files.length?`${files.length} 份简历版本`:'暂无简历附件'}</small></td>
    </tr>;
   })}
  </tbody></table></div>
  {result&&<nav className="pagination" aria-label="简历库分页"><span className="pagination-total">共 {result.total} 条 · {result.total?(result.page-1)*size+1:0}–{Math.min(result.page*size,result.total)} 条</span><div className="pagination-controls"><label>每页 <select aria-label="简历库每页条数" value={size} onChange={e=>setSize(Number(e.target.value))}>{[10,20,50].map(n=><option key={n} value={n}>{n} 条</option>)}</select></label><button disabled={loading||result.page===1} onClick={()=>setPage(page-1)}>上一页</button><span aria-live="polite">{result.page} / {result.pages}</span><button disabled={loading||result.page===result.pages} onClick={()=>setPage(page+1)}>下一页</button></div></nav>}
  {!loading&&!error&&result&&!candidates.length&&<div className="empty">{result.libraryTotal?'没有匹配的候选人，请调整检索条件。':'暂无候选人，点击“导入简历”建立第一份档案。'}</div>}
  <div className="table-footer"><span>每位候选人一份档案，历次应聘与简历版本集中保留</span></div>

 </section>;
}

export function CandidateArchive({candidate:c,data,open,manage,back,date}){
 const apps=data.applications.filter(a=>a.candidateId===c.id),files=candidateResumes(c,data.applications);
 return <section className="candidate-archive">
  <button className="text-button back" onClick={back}>返回简历库</button>
  <div className="title-row"><div><h1>{c.name}</h1><p className="muted">候选人档案 · {apps.length} 次应聘 · {files.length} 份简历版本</p></div><div className="actions"><button onClick={()=>open('candidate',{candidateId:c.id})}>编辑资料</button><button onClick={()=>open('candidateResume',{candidateId:c.id})}>更新简历</button>{canCreateApplication(data.applications,c.id)&&<button onClick={()=>open('createApplication',{candidateId:c.id})}>{apps.length?'重新捞起':'创建应聘'}</button>}</div></div>
  <section className="candidate-profile" aria-label="候选人档案资料"><dl>{[['phone','手机号'],['email','邮箱'],...profileFields].map(([key,label])=><div key={key}><dt>{label}</dt><dd>{key==='education'&&!educationOptions.includes(c.education)?'待补充分类':key==='experience'?workExperienceLabel(c[key])||'待补充':c[key]||'待补充'}</dd></div>)}</dl><div className="candidate-notes"><span>HR 前置沟通记录</span><p>{c.notes||'暂无备注'}</p></div></section>
  <div className="section-heading"><h2>简历版本</h2><span className="muted">更新简历不会改写已有应聘附件</span></div>
  <PaginatedList items={files} resetKey={c.id} label="简历版本">{rows=><div className="resume-versions">{rows.map((file,i)=><div className="resume-version" key={file.id}><ResumeLink app={{resume:file}} className="text-button">{file.name}</ResumeLink><span className="muted">{file.id===files[0]?.id?'最近版本 · ':''}{file.uploadedAt?date(file.uploadedAt):'历史简历'}</span></div>)}</div>}</PaginatedList>
  <div className="section-heading"><h2>历次应聘与简历</h2><span className="muted archive-hint">需要安排面试或记录结果时，前往应聘列表处理</span></div>
  <PaginatedList items={apps} resetKey={c.id} label="应聘历史">{rows=><div className="table-wrap"><table><thead><tr><th>应聘岗位／流程</th><th>创建时间</th><th>进度／结果摘要</th><th>该次简历版本</th><th>记录入口</th></tr></thead><tbody>{rows.map(a=>{const stage=applicationStage(a),created=a.history.find(h=>h.action.startsWith('创建应聘'))?.at;return <tr key={a.id}><td>{a.job}</td><td>{created?date(created):'未记录'}</td><td><span className={`stage-label stage-${stage.tone}`}>{stage.name}</span>{a.reason&&<small className="sub">{a.reason}</small>}</td><td><ResumeLink app={a} className="text-button archive-resume">{a.resume?.name||'暂无附件'}</ResumeLink></td><td><button className="text-button" onClick={()=>manage(a.id)}>前往应聘</button></td></tr>;})}</tbody></table></div>}</PaginatedList>
  {!apps.length&&<div className="empty">暂无应聘历史，可为这位候选人创建新应聘。</div>}
 </section>;
}
