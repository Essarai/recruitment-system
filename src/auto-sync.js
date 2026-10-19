export function createAutoSync({read,apply,blocked,visible,onState,onUnauthorized,document:doc,window:win,setInterval:every=globalThis.setInterval,clearInterval:stop=globalThis.clearInterval}){
 let generation=0,controller=null,disposed=false,running=false;
 function pause(){generation++;controller?.abort();controller=null;running=false;if(!disposed)onState({syncing:false});}
 async function run(force=false){
  if(disposed||running||blocked()||!visible())return;
  const current=++generation;controller=new AbortController();const request=controller;running=true;onState({syncing:true});
  try{
   const snapshot=await read({force,signal:AbortSignal.any([request.signal,AbortSignal.timeout(20000)])});
   if(disposed||current!==generation||blocked()||!visible())return;
   if(snapshot)apply(snapshot);
   onState({lastSynced:Date.now(),error:''});
  }catch(error){
   if(disposed||current!==generation||request.signal.aborted)return;
   if(error.status===401)onUnauthorized();else onState({error:'同步失败，请重试'});
  }finally{if(!disposed&&current===generation){running=false;controller=null;onState({syncing:false});}}
 }
 const focus=()=>run(),visibility=()=>visible()?run():pause();
 const timer=every(()=>run(),10000);doc.addEventListener('visibilitychange',visibility);win.addEventListener('focus',focus);
 return {run,pause,dispose(){pause();disposed=true;stop(timer);doc.removeEventListener('visibilitychange',visibility);win.removeEventListener('focus',focus);}};
}
