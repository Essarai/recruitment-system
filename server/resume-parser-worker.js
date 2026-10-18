import {parentPort,workerData} from 'node:worker_threads';
import {createRequire} from 'node:module';
import path from 'node:path';
import {getDocument} from 'pdfjs-dist/legacy/build/pdf.mjs';
import {resumeFields} from './resume-fields.js';
const require=createRequire(import.meta.url),root=path.dirname(require.resolve('pdfjs-dist/package.json'));
let task;
try{
 task=getDocument({data:new Uint8Array(workerData),isEvalSupported:false,verbosity:0,useSystemFonts:true,standardFontDataUrl:path.join(root,'standard_fonts')+path.sep});
 const document=await task.promise,parts=[];let length=0;
 for(let i=1;i<=Math.min(document.numPages,20);i++){
  const page=await document.getPage(i),{items}=await page.getTextContent();let lastY;
  for(const item of items){if(typeof item.str!=='string')continue;const y=item.transform?.[5];if(lastY!==undefined&&y!==undefined&&Math.abs(y-lastY)>3)parts.push('\n');const text=item.str.slice(0,200000-length);parts.push(text,item.hasEOL?'\n':' ');length+=text.length;lastY=y;if(length>=200000)break;}
  parts.push('\n');page.cleanup();if(length>=200000)break;
 }
 const text=parts.join(''),result=resumeFields(text);
 if(!text.trim())result.warnings.push('未提取到文字，可能是扫描件，请手动填写；当前不支持 OCR');
 else if(!Object.keys(result.fields).length)result.warnings.push('未识别到可回填的个人信息，请手动填写');
 if(document.numPages>20||length>=200000)result.warnings.push('文件较长，仅解析前 20 页及前 20 万字，请核对');
 parentPort.postMessage({result});
}catch(error){parentPort.postMessage({error:error.name==='PasswordException'?'PDF 已加密，请解锁后重新选择，或手动填写':'PDF 文字解析失败，请手动填写；简历仍可正常上传'});}
finally{await task?.destroy();}
