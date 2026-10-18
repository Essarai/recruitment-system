import {test} from 'node:test';
import assert from 'node:assert/strict';
import {paginate} from '../src/pagination.js';
test('分页覆盖首页、中间页、尾页，保持原集合与顺序不变',()=>{
 const all=Array.from({length:23},(_,i)=>i+1);
 assert.deepEqual(paginate(all,1,10).items,all.slice(0,10));
 const middle=paginate(all,2,10);assert.deepEqual(middle.items,all.slice(10,20));assert.equal(middle.start,11);assert.equal(middle.end,20);assert.equal(middle.total,23);assert.equal(middle.pages,3);
 const last=paginate(all,3,10);assert.deepEqual(last.items,[21,22,23]);assert.equal(last.end,23);assert.equal(all.length,23);
});
test('空列表、搜索结果缩减与越界页码保持有效页，换页大小正确切分',()=>{
 assert.deepEqual(paginate([],9,10),{items:[],page:1,pages:1,total:0,start:0,end:0});
 const all=Array.from({length:101},(_,i)=>i);
 assert.equal(paginate(all,-1,10).page,1);assert.equal(paginate(all,99,10).page,11);
 assert.deepEqual(paginate(all.slice(0,3),5,10).items,[0,1,2]);
 assert.equal(paginate(all,1,20).items.length,20);assert.equal(paginate(all,3,50).items.length,1);
 assert.equal(paginate(Array(20).fill(0),2,10).pages,2);
});
