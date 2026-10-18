import React,{useState} from 'react';
import {paginate} from './pagination';

export function PaginatedList({items,resetKey='',label='列表',children}){
 const context=JSON.stringify([label,resetKey]);
 const [state,setState]=useState({page:1,size:10,resetKey:context});
 const view=paginate(items,state.resetKey===context?state.page:1,state.size);
 if(state.resetKey!==context||state.page!==view.page)setState({...state,page:view.page,resetKey:context});
 const change=(page,size=state.size)=>setState({page,size,resetKey:context});
 return <>{children(view.items)}<nav className="pagination" aria-label={`${label}分页`}>
  <span className="pagination-total">共 {view.total} 条 · {view.start}–{view.end} 条</span>
  <div className="pagination-controls"><label>每页 <select aria-label={`${label}每页条数`} value={state.size} onChange={e=>change(1,Number(e.target.value))}>{[10,20,50].map(size=><option key={size} value={size}>{size} 条</option>)}</select></label>
   <button type="button" disabled={view.page===1} onClick={()=>change(view.page-1)}>上一页</button><span aria-live="polite" aria-atomic="true">{view.page} / {view.pages}</span><button type="button" disabled={view.page===view.pages} onClick={()=>change(view.page+1)}>下一页</button>
  </div>
 </nav></>;
}
