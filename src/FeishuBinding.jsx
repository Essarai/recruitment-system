import React,{useEffect,useState} from 'react';
import {request} from './repository';
export function FeishuBinding({role,guideOnly=false}){
 const [status,setStatus]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[dismissed,setDismissed]=useState(false);
 const [reload,setReload]=useState(0);
 useEffect(()=>{setError('');const abort=new AbortController();request('/feishu/binding',{signal:abort.signal}).then(setStatus).catch(e=>{if(e.name!=='AbortError')setError('飞书绑定状态加载失败');});return()=>abort.abort();},[reload]);
 async function bind(){setBusy(true);setError('');try{const {url}=await request('/feishu/bind/start',{method:'POST'});window.location.assign(url);}catch(e){setError(e.message);setBusy(false);}}
 const guide=Boolean(status?.ready&&!status.binding&&!dismissed),recruiter=['admin','HR'].includes(role);
 if(guideOnly&&!guide)return null;
 return <span className={`feishu-account-binding${guide?' feishu-guide-active':''}${guideOnly?' guide-only-binding':''}`}><button className="text-button feishu-binding-trigger" onClick={bind} disabled={busy||!status?.ready} title={error||(!status?.ready?status?.reason||'正在加载飞书绑定状态':status.binding?`已绑定：${status.binding.name}，点击重新授权`:'绑定本人飞书账号')}>{busy?'正在跳转…':status?.binding?'飞书已绑定':'绑定飞书'}</button>{error&&<small role="alert">{error}<button className="text-button" onClick={()=>setReload(n=>n+1)}>重试</button></small>}{status&&!status.ready&&<small role="status">{status.reason}</small>}{guide&&<span className="feishu-binding-guide" role="region" aria-label="飞书绑定指引"><span className="feishu-guide-heading"><svg className="feishu-guide-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m9 15 6-6M8 10l-2 2a4 4 0 0 0 6 6l2-2M10 8l2-2a4 4 0 0 1 6 6l-2 2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg><strong>绑定你的飞书账号</strong><button className="feishu-guide-close" aria-label="关闭飞书绑定指引" onClick={()=>setDismissed(true)}>×</button></span><span className="feishu-guide-description">{recruiter?'用公司飞书关联本人身份。HR 仍在系统排期，面试官完成绑定后会收到日程邀请。':'简历确认通知、面试日程邀请会发送到你的飞书，接受邀请后回复会自动回流。'}</span><span className="feishu-guide-hint">{guideOnly?'点击“去绑定”，使用公司企业账号授权。':'点击上方“绑定飞书”，使用公司企业账号授权。'}</span><span className="feishu-guide-actions"><button className="text-button" onClick={()=>setDismissed(true)}>稍后再说</button><button className="task-primary" disabled={busy} onClick={bind}>{busy?'正在跳转…':'去绑定'}</button></span></span>}</span>;
}

export function FeishuAccountBindings({children}){
 const [bindings,setBindings]=useState(null),[error,setError]=useState(''),[reload,setReload]=useState(0);
 useEffect(()=>{
  let active=true,controller;
  async function load(){controller?.abort();controller=new AbortController();try{const result=await request('/feishu/config',{signal:controller.signal});if(active){setBindings(result.config.bindings||{});setError('');}}catch(e){if(active&&e.name!=='AbortError')setError('飞书绑定状态加载失败');}}
  load();const timer=setInterval(load,15000);return()=>{active=false;controller?.abort();clearInterval(timer);};
 },[reload]);
 return <>{error&&<p className="error" role="alert">{error}<button className="text-button" onClick={()=>setReload(n=>n+1)}>重试</button></p>}{children(userId=>error?'加载失败':bindings===null?'加载中…':bindings[userId]?'已绑定':'未绑定')}</>;
}
