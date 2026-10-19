import {interviewPrompt} from './mcp-prompt';
import React,{useEffect,useState} from 'react';
import {request} from './repository';

export function McpConnection(){
 const [info,setInfo]=useState(null),[secret,setSecret]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[copied,setCopied]=useState(false),[promptCopied,setPromptCopied]=useState(false),[canWrite,setCanWrite]=useState(false);
 useEffect(()=>{let active=true;request('/mcp-token').then(result=>{if(active){setInfo(result);setCanWrite(!!result.token?.canWrite);}}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[]);
 async function change(remove=false){setBusy(true);setError('');setCopied(false);try{
  const result=await request('/mcp-token',{method:remove?'DELETE':'POST',...(!remove?{body:JSON.stringify({canWrite})}:{})});setSecret(remove?'':result.token);setPromptCopied(false);
  setInfo(current=>({...current,token:remove?null:{hint:result.token.slice(-8),expiresAt:result.expiresAt,canWrite:result.canWrite}}));
 }catch(e){setError(e.message);}finally{setBusy(false);}}
 const validPromptToken=/^recruit_mcp_[a-f0-9]{64}$/.test(secret);
 const configuration=JSON.stringify({mcpServers:{'my-interviews':{url:info?.url||'',headers:{Authorization:'Bearer <替换为个人 Token>'}}}},null,2);
 return <section className="mcp-connection" aria-label="个人 MCP 连接">
  <div className="section-heading"><div><h2>MCP · 连接 AI 助手</h2><p className="muted">复制预设提示词，让 Codex 查看本人面试；开启填写权限后，可在你确认后保存草稿和上传对话。</p></div><span className="stage-label stage-neutral">{info?.token?.canWrite?'本人资料与草稿填写':'只读本人资料'}</span></div>
  <p className="muted">保存草稿前先核对评价和附件；正式提交须由你在系统中确认，提交后无法自行修改。</p>
  {error&&<p className="error" role="alert">{error}</p>}
  {!info&&!error&&<p role="status">正在加载连接信息…</p>}
  {info&&<><label className="field"><span>MCP 服务地址</span><input readOnly value={info.url}/></label>
   {info.token?<p className="muted">Token 尾号 {info.token.hint} · 有效期至 {new Date(info.token.expiresAt).toLocaleString('zh-CN')}</p>:<p className="muted">尚未启用个人 Token，有效期为 30 天。</p>}

   <label className="check"><input type="checkbox" checked={canWrite} disabled={busy} onChange={e=>setCanWrite(e.target.checked)}/>允许保存本人面评草稿和上传对话</label><p className="muted">权限变更需重新创建 Token 才生效，旧 Token 随即失效。MCP 不能正式提交，也不能修改已锁定或他人的面评。</p>
   <div className="actions"><button disabled={busy} onClick={()=>change()}>{busy?'处理中…':info.token?'重新创建 Token（旧 Token 立即失效）':'创建个人 Token'}</button>{info.token&&<button disabled={busy} onClick={()=>change(true)}>撤销 Token</button>}</div>
   {secret&&<div className="mcp-secret"><label className="field"><span>个人 Token（仅本次显示，请妥善保存）</span><textarea readOnly rows={2} spellCheck={false} value={secret}/></label><button type="button" onClick={async()=>{try{await navigator.clipboard.writeText(secret);setCopied(true);}catch{setError('无法自动复制，请手动选中 Token 复制');}}}>{copied?'已复制':'复制 Token'}</button></div>}
   <section className="mcp-prompt"><h3>一键交给 Codex</h3><p className="muted">复制后粘贴到 Codex，按提示配置连接并处理面评。提示词包含服务地址和个人 Token，仅粘贴到你信任的 Codex，不要转发或公开。</p><button className="primary" disabled={!validPromptToken} onClick={async()=>{try{await navigator.clipboard.writeText(interviewPrompt(info.url,secret));setPromptCopied(true);}catch{setError('无法自动复制，请展开预设提示词手动复制');}}}>{promptCopied?'提示词已复制':'复制预设提示词'}</button>{!secret&&<p className="muted">请先在上方{info.token?'重新创建':'创建'} Token，再复制提示词。{info.token?'重新创建会使旧 Token 立即失效。':''}</p>}<details><summary>查看预设提示词（含 Token）</summary><textarea readOnly rows={14} value={validPromptToken?interviewPrompt(info.url,secret):'请先创建 Token，系统会自动将其填入提示词。'} aria-label="Codex 预设提示词"/></details><p className="muted">首次配置可能需要重载 Codex 或开启新会话。Token 仅在当前页面内存中用于拼接，不保存在浏览器本地存储；刷新后需要重新创建 Token 才能复制提示词。</p></section>
   <details className="mcp-tutorial"><summary>连接教程与工具说明</summary>
    <ol><li>生成个人 Token，复制服务地址。</li><li>在支持 Streamable HTTP 和自定义请求头的 MCP 客户端中，添加此地址，请求头填写 <code>Authorization: Bearer 个人Token</code>。</li><li>以 Cursor 为例，将下方配置合并到个人 <code>~/.cursor/mcp.json</code>，替换 Token 占位符，然后在 MCP 设置中确认读取工具已连接；启用填写权限后还会显示两个草稿/上传工具。</li></ol>
    <pre>{configuration}</pre>
    <p className="muted">本机 localhost 地址仅供本机客户端使用；云端客户端需要可访问的 HTTPS 服务地址。当前使用个人 Token，不支持要求 OAuth 登录的客户端。</p>
    <ul><li><code>list_my_interviews</code>：分页查看简历确认、已安排和历史面试。</li><li><code>get_my_interview</code>：读取候选人资料、本人安排与本人面评。</li><li><code>save_my_feedback_draft</code>：确认后填写本人面评草稿，不正式提交。</li><li><code>upload_my_transcript</code>：确认后上传本人对话文件，再由草稿关联附件。</li><li><code>get_interview_file</code>：按需获取简历或对话附件的 5 分钟临时链接。文件读取能力取决于客户端。</li></ul>
    <p>可以这样问 AI：</p><blockquote>列出我的待面评面试，读取我指定的面试资料，整理综合评价、优势、疑虑和建议结论。只使用有依据的信息，缺失内容标注待确认，交给我核对。</blockquote>
    <p className="muted">重新创建或撤销 Token、修改或重置密码、冻结账号后，旧 Token 失效；已发出的附件临时链接最多继续有效 5 分钟。预设提示词含个人 Token，仅交给信任的 Codex，不要公开分享或放入项目仓库。</p>
    <a href="https://developers.openai.com/codex/mcp/" target="_blank" rel="noreferrer">Codex 官方连接说明</a> · <a href="https://prod.cursor.com/help/customization/mcp" target="_blank" rel="noreferrer">Cursor 官方连接说明</a>
   </details></>}
 </section>;
}
