import {randomUUID,createHash} from 'node:crypto';
import {PutObjectCommand,DeleteObjectCommand} from '@aws-sdk/client-s3';
export const MAX_FILE=20*1024*1024;
export function validateResume(name,buffer){
 if(typeof name!=='string'||!name||name.length>240||/[\r\n/\\\0]/.test(name))throw Error('简历文件名无效');
 if(!Buffer.isBuffer(buffer)||!buffer.length||buffer.length>MAX_FILE)throw Error('简历文件须大于 0 且不超过 20 MB');
 const ext=name.toLowerCase().split('.').pop();
 const signatures={pdf:['255044462d','application/pdf'],doc:['d0cf11e0a1b11ae1','application/msword'],docx:['504b0304','application/vnd.openxmlformats-officedocument.wordprocessingml.document']};
 const item=signatures[ext];if(!item||buffer.subarray(0,item[0].length/2).toString('hex')!==item[0])throw Error('文件内容与 PDF / DOC / DOCX 格式不符');
 return {extension:ext,type:item[1]};
}

export async function signedResumeAccess(client,bucket,file){
 const {GetObjectCommand}=await import('@aws-sdk/client-s3');
 const {getSignedUrl}=await import('@aws-sdk/s3-request-presigner');
 const filename=encodeURIComponent(file.name).replace(/['()*]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase());
 const command=new GetObjectCommand({Bucket:bucket,Key:file.object_key,ResponseContentType:file.mime,ResponseContentDisposition:`${file.mime==='application/pdf'?'inline':'attachment'}; filename*=UTF-8''${filename}`,ResponseCacheControl:'private, no-store'});
 return {url:await getSignedUrl(client,command,{expiresIn:300}),expiresAt:new Date(Date.now()+300000).toISOString(),name:file.name,type:file.mime};
}

export async function storePrivateFile(pool,client,bucket,ownerId,name,buffer,format,prefix){
 const id=randomUUID(),key=`${prefix}/${id}.${format.extension}`;
 await client.send(new PutObjectCommand({Bucket:bucket,Key:key,Body:buffer,ContentType:format.type,ContentMD5:createHash('md5').update(buffer).digest('base64')}));
 try{await pool.execute('INSERT INTO recruitment_files(id,object_key,name,mime,size,owner_id) VALUES(?,?,?,?,?,?)',[id,key,name,format.type,buffer.length,ownerId]);}
 catch(error){try{await client.send(new DeleteObjectCommand({Bucket:bucket,Key:key}));}catch{console.error('Failed to clean a new unregistered upload',id);}throw error;}
 return {id,name,type:format.type,size:buffer.length};
}
