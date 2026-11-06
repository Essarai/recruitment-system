import React,{useEffect,useId,useRef,useState} from 'react';
import {applicationPhaseOptions} from './application-phase';
const options=[['','全部状态','neutral'],['进行中','全部进行中','interview'],...applicationPhaseOptions.map(([value,label])=>['phase:'+value,label,value==='feedback'?'feedback':'pending']),['已录用','已录用','success'],['流程终止','流程终止','neutral']];
export function ApplicationStatusFilter({value,onChange}){
 const id=useId(),trigger=useRef(null),menu=useRef(null),[open,setOpen]=useState(false),[position,setPosition]=useState({});
 function show(){const rect=trigger.current.getBoundingClientRect();const top=Math.min(rect.bottom+6,Math.max(8,window.innerHeight-440));setPosition({left:Math.max(8,Math.min(rect.left,window.innerWidth-240)),top,maxHeight:window.innerHeight-top-12});setOpen(true);}
 useEffect(()=>{
  if(!open)return;
  menu.current?.querySelector('[aria-selected="true"]')?.focus();
  const close=e=>{if(!trigger.current?.contains(e.target)&&!menu.current?.contains(e.target))setOpen(false);};
  const dismiss=()=>setOpen(false);
  document.addEventListener('pointerdown',close);window.addEventListener('resize',dismiss);window.addEventListener('scroll',dismiss);
  return()=>{document.removeEventListener('pointerdown',close);window.removeEventListener('resize',dismiss);window.removeEventListener('scroll',dismiss);};
 },[open]);
 const selected=options.find(o=>o[0]===value)||options[0];
 function keys(e){const items=[...menu.current.querySelectorAll('[role="option"]')],index=items.indexOf(document.activeElement);if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();const next=e.key==='Home'?0:e.key==='End'?items.length-1:(index+(e.key==='ArrowDown'?1:-1)+items.length)%items.length;items[next].focus();}else if(e.key==='Escape'){e.preventDefault();e.stopPropagation();setOpen(false);trigger.current.focus();}else if(e.key==='Tab')setOpen(false);}
 return <div className="application-status-filter"><button ref={trigger} type="button" className="application-status-trigger" aria-label={'应聘状态筛选：'+selected[1]} aria-haspopup="listbox" aria-expanded={open} aria-controls={open?id:undefined} onClick={()=>open?setOpen(false):show()} onKeyDown={e=>{if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();show();}}}><span className={'status-dot stage-'+selected[2]}/><span>{selected[1]}</span><span className="status-chevron" aria-hidden="true">⌄</span></button>{open&&<div id={id} ref={menu} className="application-status-menu" role="listbox" aria-label="应聘状态" style={position} onKeyDown={keys}>{options.map(([key,label,tone],index)=><React.Fragment key={key}>{(index===1||index===8)&&<div className="application-status-group" role="presentation">{index===1?'进行中':'已结束'}</div>}<button type="button" role="option" aria-selected={key===value} tabIndex={key===value?0:-1} onClick={()=>{onChange(key);setOpen(false);trigger.current.focus();}}><span className={'status-dot stage-'+tone}/><span>{label}</span><span className="status-check" aria-hidden="true">{key===value?'✓':''}</span></button></React.Fragment>)}</div>}</div>;
}
