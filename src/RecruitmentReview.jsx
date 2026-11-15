import React,{useEffect,useRef,useState} from 'react';
import {PaginatedList} from './PaginatedList';

const metrics={
 resume:'简历审核通过率',interview:'面试通过率',conversion:'送审到约面转化率'
};
const ratio=(n,d)=>d>0?Math.round(1000*n/d)/10+'%':'—';
const fraction=(n,d)=>d>0?ratio(n,d)+'（'+n+'/'+d+'）':'—';
const reviewStatus={accepted:'通过',declined:'不通过',pending:'待确认',needs_info:'需补充',skipped:'跳过'};

export function HiringSummary({review,title,month,onMonth}){
 const team=review.team;
 const cards=[
  ['计划入职',team.target??'未设'],['实际入职',team.joined],['目标完成率',ratio(team.joined,team.target)],
  ['入职缺口',team.target===null?'—':Math.max(0,team.target-team.joined)],
  ['入职周期中位数',team.medianJoinDays===null?'—':team.medianJoinDays+' 天',team.joinCycleSamples+' 份有效样本']
 ];
 const jobs=[...review.jobs].sort((a,b)=>Math.max(0,(b.target??0)-b.joined)-Math.max(0,(a.target??0)-a.joined)||b.overdue-a.overdue||a.job.localeCompare(b.job,'zh-CN'));
 return <section className="dashboard-section">
  <div className="section-heading"><h2>{title}</h2><label>目标月份 <input type="month" value={month} onChange={e=>{if(e.target.value)onMonth(e.target.value);}}/></label></div>
  <div className="analysis-kpis">{cards.map(([label,value,hint])=><div key={label}><span>{label}</span><strong>{value}</strong>{hint&&<small>{hint}</small>}</div>)}</div>
  <p className="dashboard-note">入职按实际入职日期归月，周期从创建应聘计至实际入职。</p>
  <h2>岗位达成</h2><p className="dashboard-note">目标和入职按所选月份统计。待入职和超时为当前存量，按入职缺口排序。</p>
  <PaginatedList items={jobs} stateKey="dashboard:director-jobs" resetKey={month} label="岗位达成">{rows=><div className="table-wrap"><table className="analysis-jobs-table"><thead><tr><th>岗位</th><th>负责人</th><th>目标</th><th>入职</th><th>缺口</th><th>已接受 Offer 待入职</th><th>超时待办</th></tr></thead><tbody>{rows.map(r=><tr key={r.job}><td>{r.job}</td><td>{r.owners.join('、')}</td><td>{r.target??'未设'}</td><td>{r.joined}</td><td>{r.target===null?'—':Math.max(0,r.target-r.joined)}</td><td>{r.waitingToJoin}</td><td>{r.overdue}</td></tr>)}</tbody></table></div>}</PaginatedList>
 </section>;
}

function MetricDetails({metric,person,records,onClose,onOpen}){
 const ref=useRef(null),[round,setRound]=useState(''),[job,setJob]=useState('');
 useEffect(()=>{ref.current.showModal();},[]);
 const rows=records.flatMap(r=>{
  if(metric==='resume')return [{r,key:r.id,label:reviewStatus[r.screening?.status]||'未送审',included:['accepted','declined'].includes(r.screening?.status),success:r.screening?.status==='accepted'}];
  if(metric==='conversion')return r.sent?[{r,key:r.id,label:r.reached.scheduled?'已约面':'未约面',included:true,success:r.reached.scheduled}]:[];
  return r.rounds.filter(x=>x.status==='submitted').map((x,i)=>({r,key:r.id+':'+i,round:x.name,label:x.conclusion||'未记录结论',included:['建议通过','建议不通过'].includes(x.conclusion),success:x.conclusion==='建议通过'}));
 });
 const filtered=rows.filter(x=>(!job||x.r.job===job)&&(!round||x.round===round)),sample=filtered.filter(x=>x.included);
 return <dialog ref={ref} className="import-detail-dialog" aria-labelledby="kpi-metric-title" onCancel={onClose}>
  <div className="dialog-head"><h2 id="kpi-metric-title">{person} · {metrics[metric]}</h2><button className="text-button" onClick={onClose}>关闭</button></div>
  <div className="analysis-record-filters"><select aria-label="明细岗位" value={job} onChange={e=>setJob(e.target.value)}><option value="">全部岗位</option>{[...new Set(rows.map(x=>x.r.job))].map(v=><option key={v}>{v}</option>)}</select>{metric==='interview'&&<select aria-label="明细轮次" value={round} onChange={e=>setRound(e.target.value)}><option value="">全部轮次</option>{[...new Set(rows.map(x=>x.round))].map(v=><option key={v}>{v}</option>)}</select>}<strong>{fraction(sample.filter(x=>x.success).length,sample.length)}</strong></div>
  <PaginatedList items={filtered} stateKey="dashboard:metric-detail" resetKey={JSON.stringify([metric,person,job,round])} label="指标明细">{page=><div className="table-wrap"><table><thead><tr><th>候选人</th><th>岗位</th>{metric==='interview'&&<th>轮次</th>}<th>结论</th><th>统计口径</th></tr></thead><tbody>{page.map(x=><tr key={x.key}><td><button className="text-button" onClick={()=>{onClose();onOpen(x.r.id);}}>{x.r.name}</button></td><td>{x.r.job}</td>{metric==='interview'&&<td>{x.round}</td>}<td>{x.label}</td><td>{x.included?'计入分母':'不计入分母'}</td></tr>)}</tbody></table></div>}</PaginatedList>
 </dialog>;
}

export function HRReview({rows,performance,records,onPerson,onOpenApplication,scopeKey}){
 const [selected,setSelected]=useState(null),[query,setQuery]=useState('');
 const totals=new Map(performance.map(p=>[p.id,p]));
 const visible=rows.filter(p=>p.name.toLowerCase().includes(query.trim().toLowerCase())).sort((a,b)=>(totals.get(b.id)?.joined||0)-(totals.get(a.id)?.joined||0)||b.created-a.created);
 const person=selected&&selected.scopeKey===scopeKey&&rows.find(p=>p.id===selected.id);
 function metric(p,key,n,d){
  return <button className="text-button" aria-label={p.name+'的'+metrics[key]+' '+fraction(n,d)} onClick={()=>setSelected({id:p.id,key,scopeKey})}>{fraction(n,d)}</button>;
 }
 return <section className="dashboard-section">
  <div className="section-heading"><h2>HR 招聘复盘</h2>{rows.length>1&&<input aria-label="搜索 HR" placeholder="搜索 HR" value={query} onChange={e=>setQuery(e.target.value)}/>}</div>
  <p className="dashboard-note">目标和入职按目标月份。应聘量、通过率及转化率按筛选期间新建的应聘归属发起 HR，点击比例查看样本。约面及时率按可排期至首轮排期成功 ≤24 小时的有效记录计算。</p>
  <PaginatedList items={visible} stateKey="dashboard:director-hr" resetKey={JSON.stringify([scopeKey,query])} label="HR 复盘">{page=><div className="table-wrap"><table className="analysis-hr-table director-hr-table"><thead><tr><th>归属人</th><th>涉及岗位</th><th>目标</th><th>入职</th><th>完成率</th><th>新建应聘</th><th>简历审核通过率</th><th>面试通过率</th><th>送审到约面</th><th>约面及时率</th><th>HR 超时</th></tr></thead><tbody>{page.map(p=>{
   const t=totals.get(p.id);
   return <tr key={p.id}><td>{onPerson?<button className="text-button" onClick={()=>onPerson(p.id)}>{p.name}</button>:p.name}</td><td>{t?.positions?.join('、')||'—'}</td><td>{t?.target??'未设'}</td><td>{t?.joined??0}</td><td>{ratio(t?.joined,t?.target)}</td><td>{p.created}</td><td>{metric(p,'resume',p.resumePassed,p.resumePassed+p.resumeFailed)}</td><td>{metric(p,'interview',p.passed,p.passed+p.failed)}</td><td>{metric(p,'conversion',p.sentScheduled,p.sent)}</td><td>{fraction(p.bookingOnTime,p.bookingSamples)}</td><td>{t?.overdueHR??0}</td></tr>;
  })}</tbody></table></div>}</PaginatedList>
  {person&&<MetricDetails key={person.id+selected.key} person={person.name} metric={selected.key} records={records.filter(r=>r.ownerId===person.id)} onClose={()=>setSelected(null)} onOpen={onOpenApplication}/>}
 </section>;
}
