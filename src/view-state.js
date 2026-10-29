// UI preferences only; the authenticated provider owns the lifetime, never browser storage.
export function createViewStateStore(){
 const values=new Map(),listeners=new Map();
 return {
  get(key,initial){if(!values.has(key))values.set(key,typeof initial==='function'?initial():initial);return values.get(key);},
  set(key,value,initial){const before=this.get(key,initial),next=typeof value==='function'?value(before):value;if(Object.is(before,next))return;values.set(key,next);listeners.get(key)?.forEach(listener=>listener());},
  subscribe(key,listener){if(!listeners.has(key))listeners.set(key,new Set());const group=listeners.get(key);group.add(listener);return()=>{group.delete(listener);if(!group.size)listeners.delete(key);};}
 };
}
