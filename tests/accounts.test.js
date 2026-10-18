import {test} from 'node:test';
import assert from 'node:assert/strict';
import {setAccountFrozen} from '../server/accounts.js';
import {isRecruiter,canManageAccounts,roleLabel} from '../src/permissions.js';
import {visibleState,emptyState} from '../server/database.js';
test('管理员和 HR 可处理招聘，只有管理员管理账号，HR 仅收到面试官业务目录',()=>{
 for(const role of ['admin','HR'])assert.ok(isRecruiter({role}));assert.equal(isRecruiter({role:'interviewer'}),false);assert.equal(canManageAccounts({role:'HR'}),false);assert.equal(canManageAccounts({role:'admin'}),true);assert.equal(roleLabel('admin'),'管理员');
 const users=[{id:'a',name:'管理员',username:'admin',role:'admin'},{id:'h',name:'HR',username:'hr',role:'HR'},{id:'i',name:'面试官',username:'secret-login',role:'interviewer',frozen:1}];
 assert.deepEqual(visibleState(emptyState(),{role:'admin'},users,1).users,users);const hr=visibleState(emptyState(),{role:'HR'},users,1);assert.equal(hr.users.length,1);assert.equal(hr.users[0].username,undefined);assert.equal(hr.users[0].frozen,1);
});
function fakePool(accounts){const calls=[];const conn={beginTransaction:async()=>calls.push('begin'),query:async()=>[accounts],execute:async(sql,args)=>{calls.push({sql,args});return [[]];},commit:async()=>calls.push('commit'),rollback:async()=>calls.push('rollback'),release:()=>calls.push('release')};return {calls,getConnection:async()=>conn};}
test('冻结撤销会话及 Token；启用不恢复旧凭证，禁止 HR、冻结管理员及自我冻结',async()=>{
 const actor={id:'a',role:'admin'},accounts=[{...actor,frozen:0},{id:'i',role:'interviewer',frozen:0}],pool=fakePool(accounts);
 await setAccountFrozen(pool,actor,'i',true);assert.ok(pool.calls.some(c=>c.sql?.includes('DELETE FROM recruitment_sessions')));assert.ok(pool.calls.some(c=>c.sql?.includes('DELETE FROM recruitment_mcp_tokens')));assert.ok(pool.calls.includes('commit'));
 const enable=fakePool(accounts);await setAccountFrozen(enable,actor,'i',false);assert.ok(!enable.calls.some(c=>c.sql?.startsWith('DELETE')));
 await assert.rejects(setAccountFrozen(pool,{id:'h',role:'HR'},'i',true),/仅管理员/);
 const self=fakePool(accounts);await assert.rejects(setAccountFrozen(self,actor,'a',true),/不能冻结当前/);assert.ok(self.calls.includes('rollback'));assert.ok(!self.calls.includes('commit'));
 await assert.rejects(setAccountFrozen(fakePool([{...actor,frozen:1}]),actor,'i',true),/权限已失效/);
});
