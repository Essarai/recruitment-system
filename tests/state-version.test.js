import {test} from 'node:test';import assert from 'node:assert/strict';
import {directoryVersion,readVersion} from '../server/state-version.js';
test('轻量版本检查不读取业务正文，账号增删、冻结和角色变化均改变目录版本',async()=>{
 const users=[{id:'b',name:'面试官',role:'interviewer',frozen:0},{id:'a',name:'管理员',role:'admin',frozen:0}],queries=[];
 const version=await readVersion({query:async sql=>{queries.push(sql);return sql.includes('recruitment_state')?[[{revision:'12'}]]:[users];}});
 assert.equal(version.revision,12);assert.ok(!queries.some(sql=>sql.includes('payload')||sql.includes('password')));assert.equal(version.directoryVersion,directoryVersion([...users].reverse()));
 for(const changed of [[...users,{id:'c',name:'新面试官'}],[users[0]],users.map(u=>u.id==='b'?{...u,frozen:1}:u),users.map(u=>u.id==='b'?{...u,role:'HR'}:u)])assert.notEqual(directoryVersion(changed),version.directoryVersion);
});
