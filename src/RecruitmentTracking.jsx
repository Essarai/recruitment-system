import React,{useState} from 'react';
import {PaginatedList} from './PaginatedList';
import {request} from './repository';

const percent=(n,total)=>total>0?Math.round(1000*n/total)/10+'%':'—';
const hours=n=>n===null?'—':Math.round(n*10)/10+' 小时';

function TrackingForm({kind,id,before,onSaved,children,readValue}){
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState(false);
 async function save(e){
  e.preventDefault();setBusy(true);setError('');setSaved(false);
  try{
   const value=readValue(new FormData(e.currentTarget));
   await request('/recruitment-tracking',{method:'PUT',body:JSON.stringify({kind,id,before,value})});
   setSaved(true);onSaved();
  }catch(e){setError(e.message);}finally{setBusy(false);}
 }
 return <form className="tracking-form" onSubmit={save}><fieldset disabled={busy}>{children}<button className="primary" type="submit">{busy?'保存中…':'保存'}</button></fieldset>{error&&<p className="error" role="alert">{error}</p>}{saved&&<p role="status">已保存</p>}</form>;
}

export function RecruitmentBacklog({result,onOpenApplication}){
 const [phase,setPhase]=useState(''),[overdue,setOverdue]=useState(false);
 const rows=result.queue.filter(r=>r.phase!=='interview'&&(!phase||r.phase===phase)&&(!overdue||r.overdue));
 return <section className="dashboard-section">
  <h2>当前流程积压</h2>
  <p className="dashboard-note">按归属人和岗位筛选，包含所有当前待办。简历审核按 3 个工作日，其余待办按 24 小时标记超时。</p>
  <div className="analysis-kpis">{result.backlog.map(p=><div key={p.key}><small>{p.name}</small><strong>{p.count}</strong><small>超时 {p.overdue} · 中位等待 {hours(p.medianHours)}</small></div>)}</div>
  <div className="analysis-record-filters"><select aria-label="积压阶段" value={phase} onChange={e=>setPhase(e.target.value)}><option value="">全部待办阶段</option>{result.backlog.map(p=><option key={p.key} value={p.key}>{p.name}</option>)}</select><label><input type="checkbox" checked={overdue} onChange={e=>setOverdue(e.target.checked)}/> 仅超时</label></div>
  <PaginatedList items={rows} stateKey="dashboard:backlog" resetKey={JSON.stringify([result.filters.hr,result.filters.job,phase,overdue])} label="积压明细">{page=><div className="table-wrap"><table><thead><tr><th>候选人</th><th>岗位</th><th>当前阶段</th><th>当前处理人</th><th>等待</th><th>操作</th></tr></thead><tbody>{page.map(r=><tr key={r.id}><td>{r.candidateName}</td><td>{r.job}</td><td>{r.phaseName}<small className="sub">{r.round}</small></td><td>{r.handler||'未记录'}</td><td title={r.clock}>{hours(r.waitHours)}{r.overdue&&<small className="sub warning">已超时</small>}</td><td><button className="text-button" onClick={()=>onOpenApplication(r.id)}>查看应聘</button></td></tr>)}</tbody></table></div>}</PaginatedList>
 </section>;
}

function GoalForm({tracking,people,jobs,filters,onSaved}){
 const [owner,setOwner]=useState(people[0]?.id||''),[job,setJob]=useState(jobs[0]||'');
 const id=filters.hr||owner,position=filters.job||job;
 const current=tracking.goals.find(g=>g.ownerId===id&&g.job===position)||null;
 if(!people.length||!jobs.length)return null;
 return <details className="dashboard-details"><summary>设置岗位招聘目标</summary>
  <div className="analysis-record-filters">
   <label>负责人 <select value={id} disabled={!!filters.hr} onChange={e=>setOwner(e.target.value)}>{people.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
   <label>岗位 <select value={position} disabled={!!filters.job} onChange={e=>setJob(e.target.value)}>{jobs.map(j=><option key={j}>{j}</option>)}</select></label>
  </div>
  <TrackingForm key={JSON.stringify([id,position,tracking.month,current])} kind="goal" id={id} before={current} onSaved={onSaved} readValue={f=>({month:tracking.month,job:position,target:Number(f.get('target'))})}><label className="field"><span>目标入职人数</span><input name="target" type="number" min="0" max="10000" required defaultValue={current?.target??''}/></label></TrackingForm>
 </details>;
}

function OfferForm({records,onSaved,today}){
 const [search,setSearch]=useState(''),[id,setId]=useState('');
 const record=records.find(r=>r.id===id),offer=record?.offer;
 const matched=records.filter(r=>r.id===id||[r.name,r.job].some(v=>v.toLowerCase().includes(search.trim().toLowerCase())));
 return <details className="dashboard-details"><summary>登记 Offer 与入职</summary>
  <div className="analysis-record-filters"><input aria-label="搜索录用应聘" placeholder="搜索姓名或岗位" value={search} onChange={e=>setSearch(e.target.value)}/><select aria-label="选择已录用应聘" value={record?id:''} onChange={e=>setId(e.target.value)}><option value="">选择已录用应聘</option>{matched.map(r=><option key={r.id} value={r.id}>{r.name} · {r.job} · {r.owner}</option>)}</select></div>
  {record&&<TrackingForm key={JSON.stringify([id,offer])} kind="offer" id={id} before={offer} onSaved={onSaved} readValue={f=>Object.fromEntries(f)}>
   <div className="form-grid">{[['issued','Offer 发出日期'],['responded','候选人回复日期'],['joined','实际入职日期']].map(([key,label])=><label className="field" key={key}><span>{label}</span><input name={key} type="date" max={today} defaultValue={offer?.[key]||''}/></label>)}
   <label className="field"><span>候选人回复</span><select name="response" defaultValue={offer?.response||''}><option value="">待回复／未记录</option><option value="accepted">接受</option><option value="declined">拒绝</option></select></label></div>
  </TrackingForm>}
 </details>;
}

export function RecruitmentOutcomes({result,admin,people,jobs,onSaved,today}){
 const {tracking,filters}=result;
 return <section className="dashboard-section">
  <div className="section-heading"><h2>岗位目标、Offer 与入职</h2></div>
  <p className="dashboard-note">按目标月统计，跟随归属人和岗位筛选。Offer 接受率按当月发出的 Offer 计算，入职按实际入职月统计。</p>
  <PaginatedList items={tracking.monthly} stateKey="dashboard:monthly" resetKey={JSON.stringify([tracking.month,filters.hr,filters.job])} label="岗位目标">{page=><div className="table-wrap"><table><thead><tr><th>岗位</th><th>目标</th><th>Offer 已发</th><th>接受</th><th>拒绝</th><th>待回复</th><th>接受率</th><th>实际入职</th><th>目标完成率</th><th>距目标</th></tr></thead><tbody>{page.map(r=><tr key={r.job}><td>{r.job}</td><td>{r.target??'未设'}</td><td>{r.issued}</td><td>{r.accepted}</td><td>{r.declined}</td><td>{r.issued-r.accepted-r.declined}</td><td>{percent(r.accepted,r.issued)}</td><td>{r.joined}</td><td>{percent(r.joined,r.target)}</td><td>{r.target===null?'—':Math.max(0,r.target-r.joined)}</td></tr>)}</tbody></table></div>}</PaginatedList>
  {admin&&filters.hr!=='unassigned'&&<GoalForm key={JSON.stringify([filters.hr,filters.job])} tracking={tracking} people={people} jobs={jobs} filters={filters} onSaved={onSaved}/>}
  <OfferForm records={tracking.offerRecords} onSaved={onSaved} today={today}/>
 </section>;
}

export function ResumeConversion({imports,onSaved}){
 const [owner,setOwner]=useState(null),[onlyIncomplete,setOnlyIncomplete]=useState(false),[id,setId]=useState('');
 const complete=r=>Boolean(r.contact?.intent&&r.contact.availability&&r.contact.recommendation);
 const records=imports.records.filter(r=>(owner===null||r.ownerId===owner)&&(!onlyIncomplete||!complete(r)));
 const target=imports.records.find(r=>r.id===id);
 return <section className="dashboard-section">
  <h2>简历转化与前置沟通</h2><p className="dashboard-note">按所选期间首次导入的候选人统计，岗位筛选不影响本区。以候选人为单位计算是否进入应聘。求职意向、到岗时间、推进建议三项均有记录即为沟通资料完整。</p>
  <PaginatedList items={imports.people} stateKey="dashboard:resume-conversion" label="简历转化">{page=><div className="table-wrap"><table><thead><tr><th>首次录入人</th><th>导入</th><th>沟通完整</th><th>沟通完成率</th><th>进入应聘</th><th>简历转化率</th></tr></thead><tbody>{page.map(r=><tr key={r.id}><td><button className="text-button" aria-pressed={owner===r.id} onClick={()=>setOwner(owner===r.id?null:r.id)}>{r.name}</button></td><td>{r.count}</td><td>{r.completed||0}</td><td>{percent(r.completed||0,r.count)}</td><td>{r.applied||0}</td><td>{percent(r.applied||0,r.count)}</td></tr>)}</tbody></table></div>}</PaginatedList>
  <details className="dashboard-details" open={owner!==null?true:undefined}><summary>沟通记录明细</summary>
   <label><input type="checkbox" checked={onlyIncomplete} onChange={e=>setOnlyIncomplete(e.target.checked)}/> 仅资料未齐</label>
   <PaginatedList items={records} stateKey="dashboard:contact-records" resetKey={JSON.stringify([owner,onlyIncomplete])} label="前置沟通">{page=><div className="table-wrap"><table><thead><tr><th>候选人</th><th>录入时间</th><th>沟通资料</th><th>进入应聘</th><th>操作</th></tr></thead><tbody>{page.map(r=><tr key={r.id}><td>{r.name}</td><td>{new Date(r.createdAt).toLocaleDateString('zh-CN',{timeZone:'Asia/Shanghai'})}</td><td>{complete(r)?'完整':'未齐'}</td><td>{r.applied?'是':'否'}</td><td><button className="text-button" onClick={()=>setId(id===r.id?'':r.id)}>编辑沟通记录</button></td></tr>)}</tbody></table></div>}</PaginatedList>
   {target&&<TrackingForm key={JSON.stringify([id,target.contact])} kind="contact" id={id} before={target.contact} onSaved={onSaved} readValue={f=>Object.fromEntries(f)}>
    <h3>{target.name} · 前置沟通</h3>{[['intent','求职意向'],['availability','到岗时间'],['recommendation','推进建议']].map(([key,label])=><label className="field" key={key}><span>{label}</span><textarea name={key} rows={2} maxLength={500} defaultValue={target.contact?.[key]||''}/></label>)}
   </TrackingForm>}
  </details>
 </section>;
}
