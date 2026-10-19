import {useEffect,useRef,useState} from 'react';
import {createAutoSync} from './auto-sync';
import * as repository from './repository';
export function useAutoSync({enabled,paused,onUpdate,onUnauthorized}){
 const latest=useRef();latest.current={paused,onUpdate,onUnauthorized};
 const active=useRef(null),[state,setState]=useState({syncing:false,lastSynced:null,error:''});
 useEffect(()=>{
  if(!enabled)return;
  setState({syncing:false,lastSynced:Date.now(),error:''});
  const controller=createAutoSync({read:repository.readUpdates,apply:snapshot=>latest.current.onUpdate(snapshot),blocked:()=>latest.current.paused,visible:()=>document.visibilityState==='visible',onState:patch=>setState(s=>({...s,...patch})),onUnauthorized:()=>latest.current.onUnauthorized(),document,window});
  active.current=controller;
  return()=>{controller.dispose();active.current=null;};
 },[enabled]);
 useEffect(()=>{if(paused)active.current?.pause();else active.current?.run();},[enabled,paused]);
 return {...state,refresh:()=>active.current?.run(true),pause:()=>active.current?.pause()};
}
