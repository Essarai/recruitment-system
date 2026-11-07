import {MAX_FILE} from './files.js';
export function validatePortfolioFile(name,buffer){
 if(typeof name!=='string'||!name||name.length>240||/[\r\n/\\\0]/.test(name))throw Error('作品文件名无效');
 if(!Buffer.isBuffer(buffer)||!buffer.length||buffer.length>MAX_FILE)throw Error('作品附件须为非空文件且不超过 20 MB');
 const extension=name.toLowerCase().split('.').pop(),formats={pdf:['25504446','application/pdf'],ppt:['d0cf11e0','application/vnd.ms-powerpoint'],pptx:['504b0304','application/vnd.openxmlformats-officedocument.presentationml.presentation'],png:['89504e470d0a1a0a','image/png'],jpg:['ffd8ff','image/jpeg'],jpeg:['ffd8ff','image/jpeg'],webp:['52494646','image/webp'],zip:['504b','application/zip']},format=formats[extension];
 if(!format||!buffer.toString('hex').startsWith(format[0])||extension==='webp'&&buffer.toString('ascii',8,12)!=='WEBP')throw Error('作品支持 PDF、PPT、PPTX、PNG、JPG、WebP、ZIP，文件内容须匹配');return {extension,type:format[1]};
}
export function validatePortfolios(value,files){
 if(value===undefined)return undefined;
 if(!Array.isArray(value)||value.length>20)throw Error('最多添加 20 个作品');
 return value.map(p=>{
  if(typeof p.name!=='string'||!p.name.trim()||p.name.length>200)throw Error('请填写作品名称（最多 200 字）');
  const url=typeof p.url==='string'?p.url.trim():'';if(url){let u;try{u=new URL(url);}catch{throw Error('作品链接无效');}if(!['http:','https:'].includes(u.protocol)||u.username||u.password||url.length>2000)throw Error('作品链接须为有效 HTTP/HTTPS 地址');}
  if(typeof (p.description??'')!=='string'||(p.description||'').length>5000)throw Error('作品简介最多 5000 字');
  let attachment;if(p.attachment){const f=files.find(f=>f.id===p.attachment.id&&f.object_key?.startsWith('portfolios/'));if(!f)throw Error('作品附件不存在或无权关联');attachment={id:f.id,name:f.name,type:f.mime,size:f.size};}
  if(!url&&!attachment)throw Error('每个作品至少填写链接或上传附件');return {name:p.name.trim(),url,description:(p.description||'').trim(),...(attachment?{attachment}:{})};
 });
}
