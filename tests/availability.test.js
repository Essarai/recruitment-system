import {test} from 'node:test';import assert from 'node:assert/strict';
import {normalizeAvailability,dayRanges,fitsAvailability,beijingDay} from '../src/availability.js';
import {checkAvailability,busyTimes,mountAvailability} from '../server/availability.js';
const settings=()=>({from:'2026-10-01',to:'2026-12-31',weekly:Array.from({length:7},()=>[{start:'14:00',end:'18:00'}]),exceptions:[]});
const round=(id,time,extra={})=>({id,time,interviewer:'面试官甲',cancelled:false,feedback:{status:'none'},...extra});
const app=(id,rounds,status='进行中')=>({id,status,rounds});
const state=(...applications)=>({applications});
const now=Date.parse('2026-10-19T00:00:00Z'),byName=new Map([['面试官甲',settings()]]);
test('weekly settings validate dates, time ordering, overlap and duplicate/out-of-range overrides',()=>{
 assert.deepEqual(normalizeAvailability(settings()),settings());
 for(const patch of [{from:'2026-02-30'},{to:'2028-01-01'},{weekly:[]},{exceptions:[{date:'2026-09-30',ranges:[]}]}])assert.throws(()=>normalizeAvailability({...settings(),...patch}));
 for(const ranges of [[{start:'25:00',end:'26:00'}],[{start:'15:00',end:'14:00'}],[{start:'14:00',end:'16:00'},{start:'15:00',end:'17:00'}]]){
  const input=settings();input.weekly[0]=ranges;assert.throws(()=>normalizeAvailability(input));
 }
 assert.throws(()=>normalizeAvailability({...settings(),exceptions:[{date:'2026-10-20',ranges:[]},{date:'2026-10-20',ranges:[]}]}));
});
test('Beijing calendar, weekly day and full interview interval respect expiry and date overrides',()=>{
 const s=settings();s.weekly[0]=[{start:'09:00',end:'10:00'}];
 assert.equal(beijingDay(Date.parse('2026-10-19T16:00:00Z')),'2026-10-20');
 assert.deepEqual(dayRanges(s,'2026-10-19'),s.weekly[0]);assert.deepEqual(dayRanges(s,'2026-10-18'),s.weekly[6]);
 assert.equal(fitsAvailability(s,'2026-10-20T14:00',60),true);
 assert.equal(fitsAvailability(s,'2026-10-20T06:00:00Z',60),true);
 assert.equal(fitsAvailability(s,'2026-10-20T17:30',60),false);
 assert.equal(fitsAvailability(s,'2026-10-20T17:00:01',60),false);
 assert.deepEqual(dayRanges(s,'2027-01-01'),[]);
 s.exceptions=[{date:'2026-10-20',ranges:[]}];assert.equal(fitsAvailability(s,'2026-10-20T14:00',60),false);
 s.exceptions[0].ranges=[{start:'10:00',end:'12:00'}];assert.equal(fitsAvailability(s,'2026-10-20T10:00',60),true);
});
test('new bookings and reschedules require current availability and no overlap, including same-batch bookings',()=>{
 const first=app('a',[round('r','2026-10-20T14:00',{duration:60})]);
 assert.doesNotThrow(()=>checkAvailability(state(),state(first),byName,now));
 const second=app('b',[round('r2','2026-10-20T14:30')]);
 assert.throws(()=>checkAvailability(state(first),state(first,second),byName,now),/已有面试/);
 assert.throws(()=>checkAvailability(state(),state(first,second),byName,now),/已有面试/);
 second.rounds[0].time='2026-10-20T15:00';assert.doesNotThrow(()=>checkAvailability(state(first),state(first,second),byName,now));
 assert.throws(()=>checkAvailability(state(),state(first),new Map(),now),/有效/);
 assert.throws(()=>checkAvailability(state(),state(first),byName,Date.parse('2026-10-21T00:00:00Z')),/未来/);
 second.rounds[0].time='2026-10-20T17:30';assert.throws(()=>checkAvailability(state(first),state(first,second),byName,now),/有效/);
});
test('legacy schedules remain editable without backfilling availability, cancelled/ended rounds release occupancy',()=>{
 const old=state(app('a',[round('r','2026-10-20T14:00')]));
 assert.doesNotThrow(()=>checkAvailability(old,structuredClone(old),new Map(),now));
 const changed=structuredClone(old);changed.applications[0].rounds[0].focus='只改重点';assert.doesNotThrow(()=>checkAvailability(old,changed,new Map(),now));
 changed.applications[0].rounds[0].duration=90;assert.throws(()=>checkAvailability(old,changed,new Map(),now),/有效/);
 changed.applications[0].rounds[0].cancelled=true;assert.deepEqual(busyTimes(changed,'面试官甲'),[]);
 const ended=state(app('a',[round('r','2026-10-20T14:00')],'未录用'));assert.deepEqual(busyTimes(ended,'面试官甲'),[]);
 assert.deepEqual(busyTimes(old,'面试官甲',{appId:'a',roundId:'r'}),[]);
 assert.deepEqual(Object.keys(busyTimes(old,'面试官甲')[0]),['start','end']);
});
test('availability API protects ownership, sanitizes busy details and uses revision checks with transaction lock',async()=>{
 const routes={},calls=[],stored={revision:2,payload:settings()},users={role:'interviewer',frozen:0};
 const conn={beginTransaction:async()=>calls.push('begin'),commit:async()=>calls.push('commit'),rollback:async()=>calls.push('rollback'),release:()=>{},query:async sql=>{calls.push(sql);return [[{revision:1,payload:state()}]];},execute:async(sql,args)=>{calls.push(sql);if(sql.startsWith('SELECT role'))return [[users]];if(sql.startsWith('SELECT revision'))return [[stored]];return [[]];}};
 const pool={getConnection:async()=>conn,execute:async sql=>sql.includes('recruitment_users')?[[{id:'i',name:'面试官甲'}]]:[[stored]],query:async()=>[[{revision:1,payload:state(app('secret',[round('secret-round','2026-10-20T14:00')]))}]]};
 mountAvailability({get:(path,...handlers)=>routes.get=handlers.at(-1),put:(path,...handlers)=>routes.put=handlers.at(-1)},{pool});
 const response=()=>({code:200,status(n){this.code=n;return this;},json(v){this.value=v;return this;}});
 let res=response();await routes.get({user:{id:'other',role:'interviewer'},params:{id:'i'},query:{}},res);assert.equal(res.code,403);
 res=response();await routes.get({user:{id:'h',role:'HR'},params:{id:'i'},query:{day:'2026-10-20'}},res);assert.equal(res.value.busy.length,1);assert.equal(JSON.stringify(res.value).includes('secret'),false);
 res=response();await routes.put({user:{id:'h',role:'HR'},body:{}},res);assert.equal(res.code,403);
 await assert.rejects(routes.put({user:{id:'i',role:'interviewer'},body:{settings:settings(),revision:1}},response()),/其他页面/);
 await routes.put({user:{id:'i',role:'interviewer'},body:{settings:settings(),revision:2}},response());
 assert.ok(calls.some(s=>s.includes('recruitment_state WHERE id=1 FOR UPDATE')));assert.ok(calls.some(s=>s.includes('recruitment_audit')));assert.ok(calls.includes('commit'));
 users.frozen=1;await assert.rejects(routes.put({user:{id:'i',role:'interviewer'},body:{settings:settings(),revision:2}},response()),/权限/);
});
