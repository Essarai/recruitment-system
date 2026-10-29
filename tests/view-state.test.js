import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createViewStateStore} from '../src/view-state.js';

test('卸载订阅后仍保留页码、每页条数和筛选；重新进入列表恢复原值',()=>{
 const store=createViewStateStore(),initial={page:1,size:10,resetKey:'all'};
 let calls=0;const unsubscribe=store.subscribe('applications',()=>calls++);
 assert.deepEqual(store.get('applications',initial),initial);
 store.set('applications',{page:3,size:20,resetKey:'mine'});
 unsubscribe();
 assert.deepEqual(store.get('applications',initial),{page:3,size:20,resetKey:'mine'});
 store.set('applications',before=>({...before,page:2}));
 assert.equal(calls,1);assert.equal(store.get('applications').page,2);
});
test('不同列表、面试视图、档案和登录会话互相隔离',()=>{
 const store=createViewStateStore();
 for(const key of ['applications','library','interviews:all','interviews:todo','archive:1','archive:2'])store.get(key,1);
 store.set('interviews:all',3);store.set('archive:1',2);
 assert.equal(store.get('interviews:all'),3);assert.equal(store.get('interviews:todo'),1);
 assert.equal(store.get('archive:1'),2);assert.equal(store.get('archive:2'),1);
 assert.equal(createViewStateStore().get('interviews:all',1),1);
});
test('懒初始化只执行一次，未改变值不通知，重订阅和释放正常',()=>{
 const store=createViewStateStore();let initialized=0,calls=0;
 assert.equal(store.get('filters',()=>{initialized++;return 'mine';}),'mine');
 assert.equal(store.get('filters',()=>{initialized++;return 'all';}),'mine');
 const stop=store.subscribe('filters',()=>calls++);
 store.set('filters',before=>before);assert.equal(calls,0);
 store.set('filters','all');assert.equal(calls,1);stop();
 const stopAgain=store.subscribe('filters',()=>calls++);
 store.set('filters','mine');stopAgain();
 assert.equal(initialized,1);assert.equal(calls,2);
});
