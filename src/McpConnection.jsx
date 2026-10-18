import React,{useEffect,useState} from 'react';
import {request} from './repository';

export function McpConnection(){
 const [info,setInfo]=useState(null),[secret,setSecret]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[copied,setCopied]=useState(false);
 useEffect(()=>{let active=true;request('/mcp-token').then(result=>{if(active)setInfo(result);}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[]);
 async function change(remove=false){setBusy(true);setError('');setCopied(false);try{
  const result=await request('/mcp-token',{method:remove?'DELETE':'POST'});setSecret(remove?'':result.token);
  setInfo(current=>({...current,token:remove?null:{hint:result.token.slice(-8),expiresAt:result.expiresAt}}));
 }catch(e){setError(e.message);}finally{setBusy(false);}}
 const configuration=JSON.stringify({mcpServers:{'my-interviews':{url:info?.url||'',headers:{Authorization:'Bearer <替换为个人 Token>'}}}},null,2);
 return <section className="mcp-connection" aria-label="个人 MCP 连接">
  <div className="section-heading"><div><h2>MCP · 连接 AI 助手</h2><p className="muted">让你使用的 AI 助手读取本人面试资料，辅助准备面试和整理面评。</p></div><span className="stage-label stage-neutral">只读本人资料</span></div>
  <p className="muted">正式面评仍由你在系统中核对提交。连接后，所用 AI 客户端可读取你的面试资料，请使用你认可的客户端。</p>
  {error&&<p className="error" role="alert">{error}</p>}
  {!info&&!error&&<p role="status">正在加载连接信息…</p>}
  {info&&<><label className="field"><span>MCP 服务地址</span><input readOnly value={info.url}/></label>
   {info.token?<p className="muted">Token 尾号 {info.token.hint} · 有效期至 {new Date(info.token.expiresAt).toLocaleString('zh-CN')}</p>:<p className="muted">尚未启用个人 Token，有效期为 30 天。</p>}
   <div className="actions"><button disabled={busy} onClick={()=>change()}>{busy?'处理中…':info.token?'重置 Token（旧 Token 立即失效）':'生成个人 Token'}</button>{info.token&&<button disabled={busy} onClick={()=>change(true)}>撤销 Token</button>}</div>
   {secret&&<div className="mcp-secret"><label className="field"><span>个人 Token（仅本次显示，请妥善保存）</span><textarea readOnly rows={2} spellCheck={false} value={secret}/></label><button type="button" onClick={async()=>{try{await navigator.clipboard.writeText(secret);setCopied(true);}catch{setError('无法自动复制，请手动选中 Token 复制');}}}>{copied?'已复制':'复制 Token'}</button></div>}
   <details className="mcp-tutorial"><summary>连接教程与工具说明</summary>
    <ol><li>生成个人 Token，复制服务地址。</li><li>在支持 Streamable HTTP 和自定义请求头的 MCP 客户端中，添加此地址，请求头填写 <code>Authorization: Bearer 个人Token</code>。</li><li>以 Cursor 为例，将下方配置合并到个人 <code>~/.cursor/mcp.json</code>，替换 Token 占位符，然后在 MCP 设置中确认三个工具已连接。</li></ol>
    <pre>{configuration}</pre>
    <p className="muted">本机 localhost 地址仅供本机客户端使用；云端客户端需要可访问的 HTTPS 服务地址。当前使用个人 Token，不支持要求 OAuth 登录的客户端。</p>
    <ul><li><code>list_my_interviews</code>：分页查看简历确认、已安排和历史面试。</li><li><code>get_my_interview</code>：读取候选人资料、本人安排与本人面评。</li><li><code>get_interview_file</code>：按需获取简历或对话附件的 5 分钟临时链接。文件读取能力取决于客户端。</li></ul>
    <p>可以这样问 AI：</p><blockquote>列出我的待面评面试，读取我指定的面试资料，整理综合评价、优势、疑虑和建议结论。只使用有依据的信息，缺失内容标注待确认，交给我核对。</blockquote>
    <p className="muted">重置、撤销或修改登录密码后，旧 Token 失效；已发出的附件临时链接最多继续有效 5 分钟。Token 不要放入聊天内容或项目仓库。</p>
    <a href="https://prod.cursor.com/help/customization/mcp" target="_blank" rel="noreferrer">Cursor 官方连接说明</a>
   </details></>}
 </section>;
}
