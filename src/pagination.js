export function paginate(items,page=1,pageSize=10){
 const pages=Math.max(1,Math.ceil(items.length/pageSize));
 const current=Math.max(1,Math.min(pages,Math.trunc(page)||1));
 const start=(current-1)*pageSize;
 return {items:items.slice(start,start+pageSize),page:current,pages,total:items.length,start:items.length?start+1:0,end:Math.min(start+pageSize,items.length)};
}
