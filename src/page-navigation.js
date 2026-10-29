export const initialNavigation=(page='应聘列表')=>({page,tabs:{}});
export function pageNavigation(state,action){
 if(action.type==='reset')return initialNavigation(action.page);
 if(action.type==='page')return state.page===action.page?state:{...state,page:action.page};
 if(action.type==='selected'||action.type==='archived')return {...state,tabs:{...state.tabs,[state.page]:{...state.tabs[state.page],[action.type]:action.id}}};
 return state;
}
