import {useEffect,useRef,useState} from 'react';
import {useViewState} from './ViewState';
import {request} from './repository';
export function useResumeSearch(query,revision,size=20){
 const [paging,setPaging]=useViewState('library:paging',{query,page:1,size}),[snapshot,setSnapshot]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[reload,setReload]=useState(0);
 const previousQuery=useRef(query);
 const page=paging.query===query&&paging.size===size?paging.page:1,key=JSON.stringify([query,page,size]);
 useEffect(()=>{if(paging.query!==query||paging.size!==size)setPaging({query,page:1,size});},[query,size,paging]);
 useEffect(()=>{
  const delay=previousQuery.current===query?0:300;previousQuery.current=query;
  const controller=new AbortController();setLoading(true);setError('');
  const timer=setTimeout(()=>{
   request('/candidates?'+new URLSearchParams({q:query,page,size}),{signal:AbortSignal.any([controller.signal,AbortSignal.timeout(20000)])})
    .then(result=>{if(!controller.signal.aborted){if(result.page!==page)setPaging({query,page:result.page,size});setSnapshot({key:JSON.stringify([query,result.page,size]),result});}})
    .catch(e=>{if(!controller.signal.aborted)setError(e.message);})
    .finally(()=>{if(!controller.signal.aborted)setLoading(false);});
  },delay);
  return()=>{clearTimeout(timer);controller.abort();};
 },[key,revision,reload]);
 return {result:snapshot?.key===key?snapshot.result:null,loading,error,page,setPage:page=>setPaging({query,page,size}),retry:()=>setReload(n=>n+1)};
}
