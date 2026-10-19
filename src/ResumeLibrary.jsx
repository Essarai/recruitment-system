import {PaginatedList} from './PaginatedList';
import {ResumeLink} from './ResumeLink';
import React,{useState} from 'react';
import {libraryFilters,libraryRecords,lastApplicationResult,readSavedFilters} from './library-query';
import {workExperienceLabel,applicationStage,candidateResumes,canCreateApplication,educationOptions,highestEducationOptions,profileFields} from './model';

export function ResumeLibrary({data,query,open,archive,userId='local',onQueryChange=()=>{}}){
 const [filters,setFilters]=useState({...libraryFilters}),[presetName,setPresetName]=useState(''),[selectedPreset,setSelectedPreset]=useState(''),[message,setMessage]=useState('');
 const storageKey=`recruitment-library-filters-v1:${userId}`;
 const [presets,setPresets]=useState(()=>{try{return readSavedFilters(localStorage,storageKey);}catch{return [];}});
 const candidates=libraryRecords(data,query,filters),resetKey=JSON.stringify([query,filters]);
 const setFilter=(key,value)=>{setSelectedPreset('');setFilters(current=>({...current,[key]:value}));};
 const select=(key,label,options)=><label><span>{label}</span><select aria-label={`简历库${label}`} value={filters[key]} onChange={e=>setFilter(key,e.target.value)}><option value="">全部</option>{options.map(value=><option key={value} value={value}>{value}</option>)}</select></label>;
 function persist(next){try{localStorage.setItem(storageKey,JSON.stringify(next));setPresets(next);setMessage('筛选方案已保存到当前浏览器');return true;}catch{setMessage('无法保存筛选方案，请检查浏览器存储设置');return false;}}
 function savePreset(){const name=presetName.trim();if(!name){setMessage('请填写筛选方案名称');return;}if(presets.length>=10&&!presets.some(p=>p.name===name)){setMessage('最多保存 10 个方案，请先删除不用的方案');return;}if(persist([...presets.filter(p=>p.name!==name),{name,query,filters:{...filters}}])){setPresetName('');setSelectedPreset(name);}}
 const cities=[...new Set(data.candidates.map(c=>c.city).filter(Boolean))].sort(),jobs=[...new Set(data.applications.map(a=>a.job))].sort();
 const day=value=>value?new Date(value).toLocaleDateString('zh-CN',{timeZone:'Asia/Shanghai'}):'时间未记录';
 return <section className="resume-library">
  <div className="title-row"><div><h1>简历库</h1><p className="muted">按候选人查找资料、简历版本和历次应聘记录</p></div><button className="primary" onClick={()=>open('import')}>导入简历</button></div>
  <div className="library-filter-panel">
   <div className="library-filter-grid">{select('highestEducation','最高学历',highestEducationOptions)}{select('education','学历背景',educationOptions)}<label><span>工作经验</span><select aria-label="简历库工作经验" value={filters.experience} onChange={e=>setFilter('experience',e.target.value)}>{[['','全部'],['0-3','3 年以下'],['3-5','3–5 年'],['5-10','5–10 年'],['10+','10 年及以上']].map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>{select('city','所在城市',cities)}<label><span>公司</span><input aria-label="简历库公司" value={filters.company} placeholder="公司关键词" onChange={e=>setFilter('company',e.target.value)}/></label>{select('job','应聘岗位',jobs)}<label><span>应聘情况</span><select aria-label="简历库应聘情况" value={filters.active} onChange={e=>setFilter('active',e.target.value)}><option value="">全部</option><option value="yes">应聘中</option><option value="no">当前未应聘</option></select></label><label><span>排序</span><select aria-label="简历库排序" value={filters.sort} onChange={e=>setFilter('sort',e.target.value)}><option value="created">最近入库</option><option value="updated">最近更新</option><option value="applied">最近应聘</option></select></label></div>
   <div className="saved-filter-bar"><select aria-label="已保存筛选方案" value={selectedPreset} onChange={e=>{const preset=presets.find(p=>p.name===e.target.value);setSelectedPreset(e.target.value);if(preset){setFilters({...libraryFilters,...preset.filters});onQueryChange(preset.query);setMessage('');}}}><option value="">选择已保存方案</option>{presets.map(p=><option key={p.name}>{p.name}</option>)}</select>{selectedPreset&&<button className="text-button" onClick={()=>{if(persist(presets.filter(p=>p.name!==selectedPreset))){setSelectedPreset('');setMessage('筛选方案已删除');}}}>删除方案</button>}<input aria-label="筛选方案名称" maxLength={40} placeholder="方案名称" value={presetName} onChange={e=>setPresetName(e.target.value)}/><button className="text-button" onClick={savePreset}>保存当前筛选</button><button className="text-button" onClick={()=>{setFilters({...libraryFilters});onQueryChange('');setSelectedPreset('');setMessage('');}}>清除筛选</button><small className="muted">匹配 {candidates.length} 人 / 共 {data.candidates.length} 人</small></div>{message&&<small role="status" className="muted">{message}</small>}
  </div>
  <PaginatedList items={candidates} resetKey={resetKey} label="简历库">{rows=><div className="table-wrap"><table><thead><tr><th>候选人资料</th><th>应聘概况</th><th>档案操作</th></tr></thead><tbody>
   {rows.map(({candidate:c,apps,active,latest,createdAt,updatedAt})=>{
    const stage=applicationStage(active||latest),files=candidateResumes(c,data.applications),lastEnded=apps.find(a=>a.status!=='进行中'),result=lastApplicationResult(lastEnded);
    return <tr key={c.id}>
     <td className="library-candidate-details"><div className="candidate-identity"><button className="name-link candidate-name" onClick={()=>archive(c.id)}>{c.name}</button><small className="sub">{[c.age?`${c.age}岁`:'',c.highestEducation||'最高学历待补充',educationOptions.includes(c.education)?c.education:'学历背景待补充',c.city].filter(Boolean).join(' · ')}</small></div>{(c.company||c.currentTitle||c.experience)&&<small className="sub">{[c.company,c.currentTitle,workExperienceLabel(c.experience)].filter(Boolean).join(' · ')}</small>}<div className="candidate-contacts"><span>手机：{c.phone||'待补充'}</span><span>邮箱：{c.email||'待补充'}</span></div>{c.notes&&<small className="sub candidate-note-preview" title={c.notes}>备注：{c.notes}</small>}<small className="sub candidate-record-time">入库 {day(createdAt)} · 更新 {day(updatedAt)}</small></td>
     <td><span>累计 {apps.length} 次应聘</span>{latest?<><small className="sub">{active?'当前':'最近'}：{(active||latest).job}</small><span className={`stage-label stage-${stage.tone}`}>{stage.name}</span></>:<small className="sub">暂无应聘记录</small>}{result&&<small className="sub">最近结果：{applicationStage(lastEnded).name} · {result.round}<br/>{day(result.at)}</small>}</td>
     <td><div className="library-actions">{files[0]?.id&&<ResumeLink app={{resume:files[0]}} className="text-button">{files[0].name.toLowerCase().endsWith('.pdf')?'预览简历':'下载简历'}</ResumeLink>}<button className="text-button" onClick={()=>archive(c.id)}>查看档案</button><button className="text-button" onClick={()=>open('candidate',{candidateId:c.id})}>编辑资料</button><button className="text-button" onClick={()=>open('candidateResume',{candidateId:c.id})}>更新简历</button>{canCreateApplication(data.applications,c.id)&&<button className="text-button" onClick={()=>open('createApplication',{candidateId:c.id})}>{apps.length?'重新捞起':'创建应聘'}</button>}</div><small className="sub library-version-count">{files.length?`${files.length} 份简历版本`:'暂无简历附件'}</small></td>
    </tr>;
   })}
  </tbody></table></div>}</PaginatedList>
  {!candidates.length&&<div className="empty">{data.candidates.length?'没有匹配的候选人，请调整搜索或筛选条件。':'暂无候选人，点击“导入简历”建立第一份档案。'}</div>}
  <div className="table-footer"><span>每位候选人一份档案，历次应聘与简历版本集中保留</span></div>
 </section>;
}

export function CandidateArchive({candidate:c,data,open,manage,back,date}){
 const apps=data.applications.filter(a=>a.candidateId===c.id),files=candidateResumes(c,data.applications);
 return <section className="candidate-archive">
  <button className="text-button back" onClick={back}>返回简历库</button>
  <div className="title-row"><div><h1>{c.name}</h1><p className="muted">候选人档案 · {apps.length} 次应聘 · {files.length} 份简历版本</p></div><div className="actions"><button onClick={()=>open('candidate',{candidateId:c.id})}>编辑资料</button><button onClick={()=>open('candidateResume',{candidateId:c.id})}>更新简历</button>{canCreateApplication(data.applications,c.id)&&<button onClick={()=>open('createApplication',{candidateId:c.id})}>{apps.length?'重新捞起':'创建应聘'}</button>}</div></div>
  <section className="candidate-profile" aria-label="候选人档案资料"><dl>{[['phone','手机号'],['email','邮箱'],...profileFields].map(([key,label])=><div key={key}><dt>{label}</dt><dd>{key==='education'&&!educationOptions.includes(c.education)?'待补充分类':key==='experience'?workExperienceLabel(c[key])||'待补充':c[key]||'待补充'}</dd></div>)}</dl><div className="candidate-notes"><span>HR 备注</span><p>{c.notes||'暂无备注'}</p></div></section>
  <div className="section-heading"><h2>简历版本</h2><span className="muted">更新简历不会改写已有应聘附件</span></div>
  <PaginatedList items={files} resetKey={c.id} label="简历版本">{rows=><div className="resume-versions">{rows.map((file,i)=><div className="resume-version" key={file.id}><ResumeLink app={{resume:file}} className="text-button">{file.name}</ResumeLink><span className="muted">{file.id===files[0]?.id?'最近版本 · ':''}{file.uploadedAt?date(file.uploadedAt):'历史简历'}</span></div>)}</div>}</PaginatedList>
  <div className="section-heading"><h2>历次应聘与简历</h2><span className="muted archive-hint">需要安排面试或记录结果时，前往应聘列表处理</span></div>
  <PaginatedList items={apps} resetKey={c.id} label="应聘历史">{rows=><div className="table-wrap"><table><thead><tr><th>应聘岗位／流程</th><th>创建时间</th><th>进度／结果摘要</th><th>该次简历版本</th><th>记录入口</th></tr></thead><tbody>{rows.map(a=>{const stage=applicationStage(a),created=a.history.find(h=>h.action.startsWith('创建应聘'))?.at;return <tr key={a.id}><td>{a.job}</td><td>{created?date(created):'未记录'}</td><td><span className={`stage-label stage-${stage.tone}`}>{stage.name}</span>{a.reason&&<small className="sub">{a.reason}</small>}</td><td><ResumeLink app={a} className="text-button archive-resume">{a.resume?.name||'暂无附件'}</ResumeLink></td><td><button className="text-button" onClick={()=>manage(a.id)}>前往应聘</button></td></tr>;})}</tbody></table></div>}</PaginatedList>
  {!apps.length&&<div className="empty">暂无应聘历史，可为这位候选人创建新应聘。</div>}
 </section>;
}
