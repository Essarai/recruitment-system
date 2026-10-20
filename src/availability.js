export const beijingDay=(now=Date.now())=>new Date(now+8*3600000).toISOString().slice(0,10);
export function validDay(day){return typeof day==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(day)&&!Number.isNaN(Date.parse(day+'T00:00:00+08:00'))&&new Date(Date.parse(day+'T00:00:00+08:00')+8*3600000).toISOString().slice(0,10)===day;}
export const minute=value=>typeof value==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(value)?Number(value.slice(0,2))*60+Number(value.slice(3)):NaN;
export function normalizeAvailability(input){
 if(!input||!validDay(input.from)||!validDay(input.to)||input.from>input.to||Date.parse(input.to)-Date.parse(input.from)>366*86400000)throw Error('请选择有效期，最长一年');
 const ranges=list=>{
  if(!Array.isArray(list)||list.length>10)throw Error('每天最多设置 10 个时段');
  const result=list.map(r=>{if(!r||!Number.isFinite(minute(r.start))||!Number.isFinite(minute(r.end))||minute(r.start)>=minute(r.end))throw Error('时段须为有效的开始和结束时间，且开始早于结束');return {start:r.start,end:r.end};}).sort((a,b)=>a.start.localeCompare(b.start));
  if(result.some((r,i)=>i&&result[i-1].end>r.start))throw Error('同一天的可用时段不能重叠');return result;
 };
 if(!Array.isArray(input.weekly)||input.weekly.length!==7)throw Error('请设置完整的每周可用时间');
 if(!Array.isArray(input.exceptions)||input.exceptions.length>100)throw Error('指定日期调整最多 100 天');
 const seen=new Set();
 return {from:input.from,to:input.to,weekly:input.weekly.map(ranges),exceptions:input.exceptions.map(e=>{if(!e||!validDay(e.date)||e.date<input.from||e.date>input.to||seen.has(e.date))throw Error('调整日期须在有效期内且不能重复');seen.add(e.date);return {date:e.date,ranges:ranges(e.ranges)};})};
}
export function dayRanges(settings,day){
 if(!settings||day<settings.from||day>settings.to||!validDay(day))return [];
 const exception=settings.exceptions.find(e=>e.date===day);
 return exception?exception.ranges:settings.weekly[(new Date(day+'T12:00:00+08:00').getUTCDay()+6)%7];
}
export const appointmentTime=value=>typeof value==='string'&&validDay(value.slice(0,10))&&/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d{1,3})?)?(?:Z|[+-]\d\d:\d\d)?$/.test(value)?Date.parse(/(Z|[+-]\d\d:\d\d)$/.test(value)?value:value+'+08:00'):NaN;
export function fitsAvailability(settings,time,duration){
 const at=appointmentTime(time);if(!Number.isFinite(at))return false;
 const local=new Date(at+8*3600000),day=local.toISOString().slice(0,10),start=local.getUTCHours()*60+local.getUTCMinutes()+local.getUTCSeconds()/60+local.getUTCMilliseconds()/60000;
 return dayRanges(settings,day).some(r=>minute(r.start)<=start&&start+duration<=minute(r.end));
}
export const overlaps=(a,b)=>a.start<b.end&&b.start<a.end;
