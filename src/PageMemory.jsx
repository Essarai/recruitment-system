import React,{useLayoutEffect,useRef} from 'react';
import {useViewState} from './ViewState';

export function RememberedDetails({stateKey,open=false,...props}){
 const [expanded,setExpanded]=useViewState('disclosure:'+stateKey,open);
 return <details {...props} open={expanded} onToggle={e=>setExpanded(e.currentTarget.open)}/>;
}

export function PageMemory({viewKey,loading=false,children}){
 const root=useRef(null),[positions]=useViewState('navigation:scroll',()=>new Map());
 useLayoutEffect(()=>{
  const element=root.current,target=positions.get(viewKey)||{x:0,y:0};let restoring=true,frame;
  const remember=()=>{if(!restoring)positions.set(viewKey,{x:window.scrollX,y:window.scrollY});};
  const stop=()=>{restoring=false;resize.disconnect();changes.disconnect();};
  const restore=()=>{
   if(!restoring)return;
   window.scrollTo({left:target.x,top:target.y,behavior:'instant'});
   if(!element.closest('[aria-busy="true"]')&&!element.querySelector('[aria-busy="true"]'))stop();
  };
  // Query-backed lists must finish loading before a short placeholder can clamp the saved position.
  const resize=new ResizeObserver(restore),changes=new MutationObserver(restore);
  resize.observe(element);changes.observe(element,{childList:true,subtree:true,attributes:true,attributeFilter:['aria-busy']});
  const interrupt=()=>{stop();remember();};
  window.addEventListener('scroll',remember,{passive:true});
  for(const event of ['wheel','touchstart','pointerdown','keydown'])window.addEventListener(event,interrupt,{passive:true});
  restore();frame=requestAnimationFrame(restore);
  return()=>{stop();cancelAnimationFrame(frame);window.removeEventListener('scroll',remember);for(const event of ['wheel','touchstart','pointerdown','keydown'])window.removeEventListener(event,interrupt);};
 },[viewKey,positions]);
 return <div ref={root} aria-busy={loading||undefined}>{children}</div>;
}
