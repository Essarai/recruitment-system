import {PaginatedList} from './PaginatedList';
import {ResumeLink} from './ResumeLink';
import React from 'react';
import {applicationStage,candidateResumes,canCreateApplication,educationOptions,profileFields} from './model';

export function ResumeLibrary({data,query,open,archive}){
 const candidates=data.candidates.filter(c=>`${c.name} ${c.phone} ${c.email}`.toLowerCase().includes(query.toLowerCase()));
 return <section className="resume-library">
  <div className="title-row"><div><h1>简历库</h1><p className="muted">按候选人查找资料、简历版本和历次应聘记录</p></div><button onClick={()=>open('import')}>录入新候选人并创建应聘</button></div>
  <PaginatedList items={candidates} resetKey={query} label="简历库">{rows=><div className="table-wrap"><table><thead><tr><th>候选人资料</th><th>联系方式</th><th>应聘概况</th><th>简历附件</th><th>档案操作</th></tr></thead><tbody>
   {rows.map(c=>{
    const apps=data.applications.filter(a=>a.candidateId===c.id),active=apps.find(a=>a.status==='进行中'),latest=apps[0],stage=applicationStage(active||latest),files=candidateResumes(c,data.applications);
    return <tr key={c.id}>
     <td><button className="name-link candidate-name" onClick={()=>archive(c.id)}>{c.name}</button><small className="sub">{[c.age?`${c.age}岁`:'',educationOptions.includes(c.education)?c.education:'学历待补充',c.city].filter(Boolean).join(' · ')}</small>{(c.company||c.currentTitle||c.experience)&&<small className="sub">{[c.company,c.currentTitle,c.experience].filter(Boolean).join(' · ')}</small>}</td>
     <td><span>{c.phone||'未填写手机号'}</span><small className="sub">{c.email||'未填写邮箱'}</small></td>
     <td><span>累计 {apps.length} 次应聘</span>{latest?<><small className="sub">{active?'当前':'最近'}：{(active||latest).job}</small><span className={`stage-label stage-${stage.tone}`}>{stage.name}</span></>:<small className="sub">暂无应聘记录</small>}</td>
     <td>{files[0]?.id?<ResumeLink app={{resume:files[0]}} className="text-button resume-file">{files[0].name.toLowerCase().endsWith('.pdf')?'预览最新 PDF':'下载最新简历'}</ResumeLink>:<span className="muted">暂无附件</span>}<small className="sub">{files.length} 份简历版本</small></td>
     <td><div className="library-actions"><button className="text-button" onClick={()=>archive(c.id)}>查看档案</button><button className="text-button" onClick={()=>open('candidate',{candidateId:c.id})}>编辑资料</button><button className="text-button" onClick={()=>open('candidateResume',{candidateId:c.id})}>更新简历</button>{canCreateApplication(data.applications,c.id)&&<button className="text-button" onClick={()=>open('import',{candidateId:c.id})}>{apps.length?'重新捞起':'创建应聘'}</button>}</div></td>
    </tr>;
   })}
  </tbody></table></div>}</PaginatedList>
  {!candidates.length&&<div className="empty">{data.candidates.length?'没有匹配的候选人，请调整搜索内容。':'暂无候选人，点击“录入新候选人并创建应聘”建立第一份档案。'}</div>}
  <div className="table-footer"><span>每位候选人一份档案，历次应聘与简历版本集中保留</span></div>
 </section>;
}

export function CandidateArchive({candidate:c,data,open,manage,back,date}){
 const apps=data.applications.filter(a=>a.candidateId===c.id),files=candidateResumes(c,data.applications);
 return <section className="candidate-archive">
  <button className="text-button back" onClick={back}>返回简历库</button>
  <div className="title-row"><div><h1>{c.name}</h1><p className="muted">候选人档案 · {apps.length} 次应聘 · {files.length} 份简历版本</p></div><div className="actions"><button onClick={()=>open('candidate',{candidateId:c.id})}>编辑资料</button><button onClick={()=>open('candidateResume',{candidateId:c.id})}>更新简历</button>{canCreateApplication(data.applications,c.id)&&<button onClick={()=>open('import',{candidateId:c.id})}>{apps.length?'重新捞起':'创建应聘'}</button>}</div></div>
  <section className="candidate-profile" aria-label="候选人档案资料"><dl>{[['phone','手机号'],['email','邮箱'],...profileFields].map(([key,label])=><div key={key}><dt>{label}</dt><dd>{key==='education'&&!educationOptions.includes(c.education)?'待补充分类':c[key]||'待补充'}</dd></div>)}</dl><div className="candidate-notes"><span>HR 备注</span><p>{c.notes||'暂无备注'}</p></div></section>
  <div className="section-heading"><h2>简历版本</h2><span className="muted">更新简历不会改写已有应聘附件</span></div>
  <PaginatedList items={files} resetKey={c.id} label="简历版本">{rows=><div className="resume-versions">{rows.map((file,i)=><div className="resume-version" key={file.id}><ResumeLink app={{resume:file}} className="text-button">{file.name}</ResumeLink><span className="muted">{file.id===files[0]?.id?'最近版本 · ':''}{file.uploadedAt?date(file.uploadedAt):'历史简历'}</span></div>)}</div>}</PaginatedList>
  <div className="section-heading"><h2>历次应聘与简历</h2><span className="muted archive-hint">需要安排面试或记录结果时，前往应聘列表处理</span></div>
  <PaginatedList items={apps} resetKey={c.id} label="应聘历史">{rows=><div className="table-wrap"><table><thead><tr><th>应聘岗位／流程</th><th>创建时间</th><th>进度／结果摘要</th><th>该次简历版本</th><th>记录入口</th></tr></thead><tbody>{rows.map(a=>{const stage=applicationStage(a),created=a.history.find(h=>h.action.startsWith('创建应聘'))?.at;return <tr key={a.id}><td>{a.job}</td><td>{created?date(created):'未记录'}</td><td><span className={`stage-label stage-${stage.tone}`}>{stage.name}</span>{a.reason&&<small className="sub">{a.reason}</small>}</td><td><ResumeLink app={a} className="text-button archive-resume">{a.resume?.name||'暂无附件'}</ResumeLink></td><td><button className="text-button" onClick={()=>manage(a.id)}>前往应聘</button></td></tr>;})}</tbody></table></div>}</PaginatedList>
  {!apps.length&&<div className="empty">暂无应聘历史，可为这位候选人创建新应聘。</div>}
 </section>;
}
