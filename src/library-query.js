export const libraryFilters={highestEducation:'',education:'',experience:'',city:'',company:'',job:'',active:'',sort:'created'};
const stamp=value=>{const time=Date.parse(value);return Number.isFinite(time)?time:0;};
export function applicationCreatedAt(app){
 const dates=(app.history||[]).filter(h=>h.action?.startsWith('创建应聘')).map(h=>stamp(h.at)).filter(Boolean);
 return dates.length?Math.min(...dates):0;
}
export function libraryRecords(data,query='',filters=libraryFilters){
 const applications=new Map();for(const app of data.applications){if(!applications.has(app.candidateId))applications.set(app.candidateId,[]);applications.get(app.candidateId).push(app);}
 return data.candidates.map(candidate=>{
  const apps=[...(applications.get(candidate.id)||[])].sort((a,b)=>applicationCreatedAt(b)-applicationCreatedAt(a));
  const dates=(candidate.resumes||[]).map(r=>stamp(r.uploadedAt)).filter(Boolean),applicationDates=apps.map(applicationCreatedAt).filter(Boolean);
  const createdAt=stamp(candidate.createdAt)||Math.min(...dates,...applicationDates,Infinity),updatedAt=stamp(candidate.updatedAt)||Math.max(...dates,Number.isFinite(createdAt)?createdAt:0);
  return {candidate,apps,active:apps.find(a=>a.status==='进行中'),latest:apps[0],createdAt:Number.isFinite(createdAt)?createdAt:0,updatedAt,lastAppliedAt:applicationDates[0]||0};
 }).filter(({candidate:c,apps,active})=>{
  if(!`${c.name} ${c.phone||''} ${c.email||''} ${c.company||''} ${c.currentTitle||''} ${apps.map(a=>a.job).join(' ')}`.toLowerCase().includes(query.trim().toLowerCase()))return false;
  for(const key of ['highestEducation','education','city'])if(filters[key]&&c[key]!==filters[key])return false;
  if(filters.company&&!String(c.company||'').toLowerCase().includes(filters.company.trim().toLowerCase()))return false;
  if(filters.job&&!apps.some(a=>a.job===filters.job))return false;
  if(filters.active==='yes'&&!active||filters.active==='no'&&active)return false;
  if(filters.experience){
   const match=String(c.experience||'').trim().match(/^(\d+(?:\.\d+)?)(?:\s*(?:年|years?))?(?:以上|以下|左右)?$/i),years=match?Number(match[1]):/应届|无工作经验/.test(c.experience||'')?0:null;
   if(years===null||filters.experience==='0-3'&&years>=3||filters.experience==='3-5'&&(years<3||years>=5)||filters.experience==='5-10'&&(years<5||years>=10)||filters.experience==='10+'&&years<10)return false;
  }
  return true;
 }).sort((a,b)=>(filters.sort==='updated'?b.updatedAt-a.updatedAt:filters.sort==='applied'?b.lastAppliedAt-a.lastAppliedAt:b.createdAt-a.createdAt));
}
export function lastApplicationResult(app){
 if(!app||app.status==='进行中')return null;
 const negative=app.rounds.find(r=>r.feedback.status==='submitted'&&r.feedback.conclusion==='建议不通过');
 const round=negative||app.rounds.find(r=>r.time&&!r.cancelled&&r.feedback.status!=='submitted')||[...app.rounds].reverse().find(r=>r.feedback.status==='submitted');
 return {at:app.endedAt||'',round:app.screening?.status==='declined'?'简历确认':round?.name||'未记录轮次'};
}
export function readSavedFilters(storage,key){
 try{const values=JSON.parse(storage.getItem(key)||'[]');return Array.isArray(values)?values.filter(v=>typeof v.name==='string'&&v.name.trim()&&v.filters&&typeof v.filters==='object').slice(0,10).map(v=>({name:v.name.slice(0,40),query:typeof v.query==='string'?v.query:'',filters:Object.fromEntries(Object.entries(libraryFilters).map(([k,value])=>[k,typeof v.filters[k]==='string'?v.filters[k]:value]))})):[];}catch{return [];}
}
