import React,{createContext,useContext,useState,useSyncExternalStore} from 'react';
import {createViewStateStore} from './view-state';
const ViewStateContext=createContext(null);
export function ViewStateProvider({children}){
 const [store]=useState(createViewStateStore);
 return <ViewStateContext.Provider value={store}>{children}</ViewStateContext.Provider>;
}
export function useViewState(key,initial){
 const shared=useContext(ViewStateContext),[local]=useState(createViewStateStore),store=shared||local;
 const value=useSyncExternalStore(listener=>store.subscribe(key,listener),()=>store.get(key,initial));
 return [value,next=>store.set(key,next,initial)];
}
