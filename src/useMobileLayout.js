import {useEffect,useState} from 'react';
export function useMobileLayout(){
 const [mobile,setMobile]=useState(()=>window.matchMedia('(max-width:650px)').matches);
 useEffect(()=>{const media=window.matchMedia('(max-width:650px)'),change=()=>setMobile(media.matches);change();media.addEventListener('change',change);return()=>media.removeEventListener('change',change);},[]);
 return mobile;
}
