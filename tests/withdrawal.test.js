import {test} from 'node:test';import assert from 'node:assert/strict';
import {canWithdrawApplication} from '../src/permissions.js';
import {withdrawApplication,mountWithdrawal} from '../server/withdrawal.js';
import {applicationStatus,canCreateApplication} from '../src/model.js';
const hr={id:'hr',name:'HR甲',role:'HR'},admin={id:'admin',name:'管理员',role:'admin'};
const fixture=()=>({id:'a',candidateId:'c',createdBy:'hr',status:'进行中',reason:'',history:[{action:'创建应聘',actor:'HR甲',at:'2026-10-20T00:00:00Z'}],screening:{status:'pending',interviewer:'甲'},rounds:[{id:'r',time:'2026-10-21T14:00',interviewer:'甲',feedback:{status:'none'},cancelled:false}]});
test('withdraw permission allows creator/admin before interviewer actions, not foreign HR or interviewer',()=>{
 assert.equal(canWithdrawApplication(hr,fixture()),true);assert.equal(canWithdrawApplication(admin,fixture()),true);
 assert.equal(canWithdrawApplication({...hr,id:'foreign'},fixture()),false);assert.equal(canWithdrawApplication({role:'interviewer'},fixture()),false);
 const legacy=fixture();delete legacy.createdBy;assert.equal(canWithdrawApplication(hr,legacy),true);
 for(const status of ['accepted','declined']){const a=fixture();a.screening.status=status;assert.equal(canWithdrawApplication(hr,a),false);}
 for(const status of ['draft','returned','submitted']){const a=fixture();a.rounds[0].feedback.status=status;assert.equal(canWithdrawApplication(hr,a),false);}
 const past=fixture();past.rounds[0].feedbackVersions=[{status:'submitted'}];assert.equal(canWithdrawApplication(hr,past),false);
});
test('withdrawal cancels pending work, preserves resume/history, displays withdrawn and releases reapplication guard',()=>{
 const a=fixture();a.resume={id:'private-file'};const now='2026-10-20T09:00:00Z';withdrawApplication(a,hr,now);
 assert.equal(a.withdrawnAt,now);assert.equal(a.withdrawnBy,hr.id);assert.equal(applicationStatus(a),'已撤回');assert.equal(a.rounds[0].cancelled,true);assert.equal(a.resume.id,'private-file');assert.equal(a.history.length,2);assert.equal(canCreateApplication([a],'c'),true);
 assert.throws(()=>withdrawApplication(a,hr),/仅可撤回/);
});
test('withdraw route checks locked revision/live actor and audits; ended archival retains result',async()=>{
 let handler,record=fixture(),actor=hr;const calls=[];
 const conn={beginTransaction:async()=>{},commit:async()=>calls.push('commit'),rollback:async()=>calls.push('rollback'),release:()=>{},query:async sql=>{calls.push(sql);return sql.includes('recruitment_state')?[[{revision:7,payload:{candidates:[{id:'c',name:'候选人'}],templates:[],applications:[record]}}]]:[[hr,admin]];},execute:async(sql,args)=>{calls.push(sql);return sql.startsWith('SELECT id,name')?[[actor]]:[[]];}};
 mountWithdrawal({post:(paths,...handlers)=>handler=handlers.at(-1)},{pool:{getConnection:async()=>conn,query:conn.query}});
 const req=(path,revision=7)=>({path,user:hr,params:{appId:'a'},body:{revision}}),res={json(value){this.value=value;return value;}};
 await assert.rejects(handler(req('/a/withdraw',6),res),/数据已更新/);
 await handler(req('/a/withdraw'),res);const done=res.value;assert.equal(done.applications[0].withdrawnBy,'hr');assert.ok(calls.some(q=>q.includes('FOR UPDATE')));assert.ok(calls.some(q=>q.includes('recruitment_audit')));
 record=fixture();record.status='候选人退出';record.reason='候选人主动退出';await assert.rejects(handler(req('/a/archive'),res),/仅管理员/);
 actor=admin;await handler(req('/a/archive'),res);const archived=res.value;assert.ok(archived.applications[0].archivedAt);assert.equal(record.reason,'候选人主动退出');assert.equal(record.status,'候选人退出');
});
