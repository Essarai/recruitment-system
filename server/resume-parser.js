import {Worker} from 'node:worker_threads';
import {validateResume} from './files.js';
let active=0;
export function parseResume(name,buffer){
 if(validateResume(name,buffer).extension!=='pdf')throw Error('自动识别仅支持 PDF，Word 请手动填写');
 if(active>=2)throw Error('解析繁忙，请稍后重新选择 PDF，或手动填写');
 active++;
 return new Promise((resolve,reject)=>{
  let worker,timer,done=false;
  const finish=(error,result)=>{if(done)return;done=true;active--;clearTimeout(timer);worker?.terminate();error?reject(error):resolve(result);};
  try{
   worker=new Worker(new URL('./resume-parser-worker.js',import.meta.url),{workerData:buffer,resourceLimits:{maxOldGenerationSizeMb:256},execArgv:process.execArgv.filter(arg=>!arg.startsWith('--input-type'))});
   timer=setTimeout(()=>finish(Error('PDF 解析超时，请手动填写；简历仍可正常上传')),15000);
   worker.once('message',message=>finish(message.error?Error(message.error):null,message.result));
   worker.once('error',()=>finish(Error('PDF 解析失败，请手动填写；简历仍可正常上传')));
   worker.once('exit',()=>{if(!done)finish(Error('PDF 解析未完成，请手动填写'));});
  }catch{finish(Error('PDF 解析暂时不可用，请手动填写'));}
 });
}
