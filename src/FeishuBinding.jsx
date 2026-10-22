import React,{useEffect,useState} from 'react';
import {request} from './repository';
export function FeishuBinding(){
 const [status,setStatus]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 useEffect(()=>{const abort=new AbortController();request('/feishu/binding',{signal:abort.signal}).then(setStatus).catch(e=>{if(e.name!=='AbortError')setError('飞书绑定状态加载失败');});return()=>abort.abort();},[]);
 async function bind(){setBusy(true);setError('');try{const {url}=await request('/feishu/bind/start',{method:'POST'});window.location.assign(url);}catch(e){setError(e.message);setBusy(false);}}
 return <span className="feishu-account-binding"><button className="text-button" onClick={bind} disabled={busy||!status?.ready} title={error||(!status?.ready?'飞书绑定尚未配置':status.binding?`已绑定：${status.binding.name}，点击重新授权`:'绑定本人飞书账号')}>{busy?'正在跳转…':status?.binding?'飞书已绑定':'绑定飞书'}</button>{error&&<small role="alert">{error}</small>}</span>;
}
