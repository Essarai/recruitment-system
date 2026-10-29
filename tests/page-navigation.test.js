import {test} from 'node:test';
import assert from 'node:assert/strict';
import {initialNavigation,pageNavigation} from '../src/page-navigation.js';

test('栏目分别记住当前详情，切换和重复点击当前栏目不清空',()=>{
 let state=initialNavigation();
 const apply=action=>state=pageNavigation(state,action);
 apply({type:'selected',id:'application-A'});
 apply({type:'page',page:'简历库'});apply({type:'archived',id:'candidate-B'});
 apply({type:'page',page:'应聘列表'});
 assert.equal(state.tabs[state.page].selected,'application-A');
 assert.equal(state.tabs['简历库'].archived,'candidate-B');
 assert.equal(pageNavigation(state,{type:'page',page:'应聘列表'}),state);
 apply({type:'selected',id:null});apply({type:'page',page:'简历库'});
 assert.equal(state.tabs[state.page].archived,'candidate-B');
 assert.equal(state.tabs['应聘列表'].selected,null);
});
test('跨栏目打开指定应聘只修改目标栏目，返回保留原档案',()=>{
 let state=initialNavigation('简历库');
 for(const action of [{type:'archived',id:'candidate-A'},{type:'page',page:'应聘列表'},{type:'archived',id:null},{type:'selected',id:'application-B'}])state=pageNavigation(state,action);
 assert.equal(state.tabs['简历库'].archived,'candidate-A');
 assert.equal(state.tabs['应聘列表'].selected,'application-B');
 state=pageNavigation(state,{type:'page',page:'招聘大盘'});
 assert.equal(state.tabs['招聘大盘'],undefined);
 assert.equal(state.tabs['应聘列表'].selected,'application-B');
});
test('登录身份变化时重置导航，不修改此前快照',()=>{
 const before=pageNavigation(initialNavigation(),{type:'selected',id:'private-application'});
 const reset=pageNavigation(before,{type:'reset',page:'我的面试'});
 assert.deepEqual(reset,{page:'我的面试',tabs:{}});
 assert.equal(before.tabs['应聘列表'].selected,'private-application');
});
