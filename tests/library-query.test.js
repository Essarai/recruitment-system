import {test} from 'node:test';import assert from 'node:assert/strict';
import {libraryFilters,libraryRecords,lastApplicationResult,readSavedFilters} from '../src/library-query.js';
const created=at=>[{action:'创建应聘',at}];
function fixture(){return {candidates:[{id:'a',name:'甲',highestEducation:'硕士',education:'双非硕',experience:'5 年',city:'杭州',company:'示例科技',createdAt:'2026-10-01',updatedAt:'2026-10-18'},{id:'b',name:'乙',highestEducation:'本科',education:'普本',experience:'应届毕业生',city:'上海',company:'其他公司',createdAt:'2026-10-02',updatedAt:'2026-10-03'},{id:'legacy',name:'历史',experience:'多年项目经验',resumes:[]}],applications:[{id:'old',candidateId:'a',job:'研发',status:'未录用',history:created('2026-10-04')},{id:'new',candidateId:'a',job:'产品',status:'进行中',history:created('2026-10-17')}]};}
test('简历库组合筛选与关键词同时生效，历史岗位可查，经验不猜测',()=>{
 const data=fixture(),filters={...libraryFilters,highestEducation:'硕士',education:'双非硕',experience:'5-10',city:'杭州',company:'科技',job:'产品',active:'yes'};
 assert.deepEqual(libraryRecords(data,'甲',filters).map(r=>r.candidate.id),['a']);assert.equal(libraryRecords(data,'乙',filters).length,0);assert.equal(libraryRecords(data,'研发',{...libraryFilters,job:'研发'}).length,1);
 assert.deepEqual(libraryRecords(data,'',{...libraryFilters,experience:'0-3'}).map(r=>r.candidate.id),['b']);assert.deepEqual(libraryRecords(data,'',{...libraryFilters,active:'no'}).map(r=>r.candidate.id),['b','legacy']);assert.equal(libraryRecords(data,'',{...filters,experience:'3-5'}).length,0);
});
test('排序按真实入库/更新/应聘时间，不依赖原数组顺序，不改写输入',()=>{
 const data=fixture(),before=structuredClone(data);assert.equal(libraryRecords(data)[0].candidate.id,'b');assert.equal(libraryRecords(data,'',{...libraryFilters,sort:'updated'})[0].candidate.id,'a');
 const [record]=libraryRecords(data,'',{...libraryFilters,sort:'applied'});assert.equal(record.latest.id,'new');assert.equal(record.active.id,'new');assert.equal(libraryRecords(data).find(r=>r.candidate.id==='legacy').createdAt,0);assert.deepEqual(data,before);
 data.candidates.push({id:'dates',name:'有依据',resumes:[{uploadedAt:'2026-09-01'},{uploadedAt:'2026-09-20'}]});const legacy=libraryRecords(data).find(r=>r.candidate.id==='dates');assert.equal(legacy.createdAt,Date.parse('2026-09-01'));assert.equal(legacy.updatedAt,Date.parse('2026-09-20'));
});
test('最近结束结果识别筛选/面试拒绝与结束时间，无证据不编造轮次',()=>{
 const app={status:'未录用',endedAt:'2026-10-18',rounds:[{name:'一面',feedback:{status:'submitted',conclusion:'建议不通过'}}]};assert.deepEqual(lastApplicationResult(app),{at:'2026-10-18',round:'一面'});assert.equal(lastApplicationResult({...app,screening:{status:'declined'}}).round,'简历确认');assert.equal(lastApplicationResult({...app,rounds:[],endedAt:''}).round,'未记录轮次');assert.equal(lastApplicationResult({...app,status:'进行中'}),null);
});
test('筛选方案按账号键读取，坏数据不阻断页面，只读取筛选条件',()=>{
 const values=new Map([['account-a',JSON.stringify([{name:'产品',query:'示例',filters:{company:'科技',active:'yes',unexpected:'ignored'}}])]]),storage={getItem:key=>values.get(key)};
 const [saved]=readSavedFilters(storage,'account-a');assert.equal(saved.filters.company,'科技');assert.equal(saved.filters.sort,'created');assert.equal(saved.filters.unexpected,undefined);assert.deepEqual(readSavedFilters(storage,'account-b'),[]);values.set('broken','not-json');assert.deepEqual(readSavedFilters(storage,'broken'),[]);assert.deepEqual(readSavedFilters({getItem(){throw Error('denied');}},'a'),[]);
});
