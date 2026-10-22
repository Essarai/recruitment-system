import {createHash,timingSafeEqual,createDecipheriv} from 'node:crypto';
export const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function feishuEnvironment(env=process.env){
 const required=['FEISHU_APP_ID','FEISHU_APP_SECRET','PUBLIC_ORIGIN'];
 const missing=required.filter(k=>!env[k]);let origin='';try{const url=new URL(env.PUBLIC_ORIGIN);if(!url.username&&!url.password&&(url.protocol==='https:'||env.NODE_ENV!=='production'&&url.protocol==='http:'&&['localhost','127.0.0.1'].includes(url.hostname)))origin=url.origin;}catch{}
 if(!origin&&!missing.includes('PUBLIC_ORIGIN'))missing.push('PUBLIC_ORIGIN（生产环境须为 HTTPS）');
 return {ready:!missing.length,missing,origin,eventsReady:!!(env.FEISHU_VERIFICATION_TOKEN&&env.FEISHU_ENCRYPT_KEY&&env.FEISHU_TENANT_KEY),polling:true,pilot:!!env.FEISHU_PILOT_USER_ID};
}
export function createFeishuClient({env=process.env,fetcher=fetch}={}){
 let token='',expires=0;
 async function tokenValue(){if(token&&Date.now()<expires)return token;const response=await fetcher('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({app_id:env.FEISHU_APP_ID,app_secret:env.FEISHU_APP_SECRET}),signal:AbortSignal.timeout(15000)});const value=await response.json();if(!response.ok||value.code!==0||!value.tenant_access_token)throw Error(`飞书应用认证失败（${value.code??response.status}）`);token=value.tenant_access_token;expires=Date.now()+Math.max(0,(value.expire-120)*1000);return token;}
 return {async call(path,{method='GET',body}={}){const response=await fetcher('https://open.feishu.cn/open-apis'+path,{method,headers:{Authorization:'Bearer '+await tokenValue(),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)});const value=await response.json();if(!response.ok||value.code!==0)throw Error(`飞书接口失败（${value.code??response.status}）`);return value.data||{};}};
}
export function verifyFeishuEvent(raw,headers,env=process.env,now=Date.now()){
 if(!env.FEISHU_ENCRYPT_KEY||!env.FEISHU_VERIFICATION_TOKEN||!env.FEISHU_APP_ID||!env.FEISHU_TENANT_KEY)throw Error('飞书回调尚未配置');
 const timestamp=headers['x-lark-request-timestamp'],nonce=headers['x-lark-request-nonce'],signature=headers['x-lark-signature'];
 if(!/^\d{10}$/.test(timestamp||'')||Math.abs(now-Number(timestamp)*1000)>300000||typeof nonce!=='string'||nonce.length>200||!/^[a-f0-9]{64}$/i.test(signature||''))throw Error('飞书回调验证失败');
 const expected=createHash('sha256').update(timestamp+nonce+env.FEISHU_ENCRYPT_KEY).update(raw).digest();
 if(!timingSafeEqual(expected,Buffer.from(signature,'hex')))throw Error('飞书回调验证失败');
 const envelope=JSON.parse(raw.toString('utf8'));
 if(typeof envelope.encrypt!=='string')throw Error('飞书回调须启用加密');
 const bytes=Buffer.from(envelope.encrypt,'base64'),key=createHash('sha256').update(env.FEISHU_ENCRYPT_KEY).digest();
 const decipher=createDecipheriv('aes-256-cbc',key,bytes.subarray(0,16));const event=JSON.parse(Buffer.concat([decipher.update(bytes.subarray(16)),decipher.final()]).toString('utf8'));
 if(event.type==='url_verification'){if(event.token!==env.FEISHU_VERIFICATION_TOKEN)throw Error('飞书回调验证失败');return event;}
 if(event.header?.token!==env.FEISHU_VERIFICATION_TOKEN||event.header?.app_id!==env.FEISHU_APP_ID||event.header?.tenant_key!==env.FEISHU_TENANT_KEY)throw Error('飞书回调验证失败');
 return event;
}
