const normalize=value=>String(value??'').normalize('NFKC').trim().toLowerCase();
function experienceBounds(value){
 const text=normalize(value).replace(/工作经验|工作年限|工作经历|经验/g,'').replace(/years?/g,'年').replace(/\s+/g,'');
 if(/^(?:应届|应届毕业生|无工作经验|无经验)$/.test(normalize(value)))return {min:0,max:0};
 const range=text.match(/^(\d+(?:\.\d+)?)[-–—~～至](\d+(?:\.\d+)?)年?$/);
 if(range){const min=Number(range[1]),max=Number(range[2]);return min<=max?{min,max}:null;}
 const match=text.match(/^(\d+(?:\.\d+)?)(?:年)?(及以上|及以下|以上|以下)?$/);
 if(!match)return null;const years=Number(match[1]);
 return {min:match[2]?.includes('以下')?0:years,max:match[2]?.includes('以上')?Infinity:years};
}
export function resumeSearchTerms(query){
 return normalize(query).replace(/(\d)\s+(?=年)/g,'$1').replace(/年\s+(?=(?:工作)?经验)/g,'年').replace(/([<>]=?)\s+(?=\d)/g,'$1').split(/[+＋,，\s]+/).filter(Boolean).map(token=>{
  const text=token.replace(/工作经验|工作年限|工作经历|经验/g,'');
  const comparison=text.match(/^(>=|<=|>|<)(\d+(?:\.\d+)?)年$/);
  if(comparison){const years=Number(comparison[2]);return {token,kind:'experience',op:comparison[1],years,label:`经验 ${comparison[1]} ${years} 年`};}
  const bounds=/年/.test(text)?experienceBounds(text):null;
  if(bounds)return {token,kind:'experience',...bounds,label:bounds.min===bounds.max?`经验 ${bounds.min} 年`:bounds.max===Infinity?`经验 ≥ ${bounds.min} 年`:bounds.min===0?`经验 ≤ ${bounds.max} 年`:`经验 ${bounds.min}–${bounds.max} 年`};
  return {token,kind:'keyword',label:token};
 });
}
export function matchesResumeSearch(candidate,terms){
 const text=normalize([candidate.name,candidate.phone,candidate.email,candidate.company,candidate.currentTitle,candidate.city,candidate.highestEducation,candidate.education].filter(Boolean).join(' '));
 return terms.every(term=>{
  if(term.kind==='keyword')return text.includes(term.token);
  const bounds=experienceBounds(candidate.experience);if(!bounds)return false;
  if(term.op==='>=')return bounds.min>=term.years;if(term.op==='>')return bounds.min>term.years;
  if(term.op==='<=')return bounds.max<=term.years;if(term.op==='<')return bounds.max<term.years;
  return bounds.min>=term.min&&bounds.max<=term.max;
 });
}
