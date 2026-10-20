import {test} from 'node:test';import assert from 'node:assert/strict';
import {applicationCreatorName} from '../src/permissions.js';
test('application initiator prefers immutable creator account, otherwise original creation actor, never later operator',()=>{
 const history=[{action:'安排面试',actor:'代操作管理员'},{action:'创建应聘',actor:'原HR'}];
 assert.equal(applicationCreatorName({createdBy:'hr',history},[{id:'hr',name:'HR姓名'}]),'HR姓名');
 assert.equal(applicationCreatorName({createdBy:'hr',history},[]),'原HR');
 assert.equal(applicationCreatorName({history},[]),'原HR');
 assert.equal(applicationCreatorName({history:[history[0]]},[]),'未记录');
});
