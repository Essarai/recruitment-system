import {test} from 'node:test';import assert from 'node:assert/strict';
import {createAutoSync} from '../src/auto-sync.js';
function harness(read=async()=>({revision:2})){
 const doc=new EventTarget(),win=new EventTarget(),applied=[],states=[];let blocked=false,visible=true,tick,expired=0;
 const sync=createAutoSync({read,apply:value=>applied.push(value),blocked:()=>blocked,visible:()=>visible,onState:s=>states.push(s),onUnauthorized:()=>expired++,document:doc,window:win,setInterval:(fn,ms)=>{assert.equal(ms,10000);tick=fn;return 1;},clearInterval:()=>{tick=null;}});
 return {sync,doc,win,applied,states,get expired(){return expired;},block:value=>{blocked=value;},visible:value=>{visible=value;},tick:()=>tick?.()};
}
const flush=()=>new Promise(resolve=>setImmediate(resolve));
test('前台每 10 秒检查、切回页面立即检查，无变化不覆盖数据，手动刷新强制取数',async()=>{
 const requests=[];let result=null;const h=harness(async options=>{requests.push(options);return result;});
 await h.tick();assert.equal(requests.length,1);assert.equal(h.applied.length,0);assert.ok(h.states.some(s=>s.lastSynced));
 result={revision:2};h.win.dispatchEvent(new Event('focus'));await flush();assert.equal(h.applied.length,1);
 h.visible(false);h.doc.dispatchEvent(new Event('visibilitychange'));await h.tick();assert.equal(requests.length,2);
 h.visible(true);h.doc.dispatchEvent(new Event('visibilitychange'));await flush();assert.equal(requests.length,3);
 await h.sync.run(true);assert.equal(requests.at(-1).force,true);h.sync.dispose();h.win.dispatchEvent(new Event('focus'));await h.tick();assert.equal(requests.length,4);
});
test('编辑暂停及取消在途旧请求；旧请求即使晚返回也不覆盖保存结果',async()=>{
 let resolve,signal,reads=0;const h=harness(options=>{reads++;signal=options.signal;return new Promise(r=>resolve=r);});
 const old=h.sync.run();await h.tick();assert.equal(reads,1);h.block(true);h.sync.pause();assert.equal(signal.aborted,true);resolve({revision:1});await old;assert.equal(h.applied.length,0);
 await h.sync.run(true);assert.equal(reads,1);h.block(false);const resumed=h.sync.run();resolve({revision:3});await resumed;assert.deepEqual(h.applied,[{revision:3}]);h.sync.dispose();
});
test('网络失败保留数据并允许重试；401 通知重新登录；关闭后丢弃晚到响应',async()=>{
 let fail=true;const h=harness(async()=>{if(fail)throw Error('offline');return {revision:2};});await h.sync.run();assert.equal(h.applied.length,0);assert.ok(h.states.some(s=>s.error));fail=false;await h.sync.run();assert.equal(h.applied.length,1);assert.ok(h.states.some(s=>s.error===''));h.sync.dispose();
 const denied=harness(async()=>{throw Object.assign(Error('expired'),{status:401});});await denied.sync.run();assert.equal(denied.expired,1);denied.sync.dispose();
 let done;const stale=harness(()=>new Promise(r=>done=r));const pending=stale.sync.run();stale.sync.dispose();done({revision:99});await pending;assert.equal(stale.applied.length,0);
});
