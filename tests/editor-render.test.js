import {test} from 'node:test';import assert from 'node:assert/strict';
import React from 'react';import {renderToString} from 'react-dom/server';import {createServer} from 'vite';
test('非排期弹窗没有当前轮次也能渲染，添加一轮/导入/模板/更新简历不读取排期数据',async()=>{
 const vite=await createServer({server:{middlewareMode:true},appType:'custom',logLevel:'silent'});
 try{
  const {Editor}=await vite.ssrLoadModule('/src/App.jsx');
  const data={users:[],candidates:[{id:'c',name:'测试候选人',resumes:[]}],applications:[{id:'a',candidateId:'c',rounds:[]}],templates:[]};
  for(const [type,label] of [['addRound','面试轮次名称'],['import','上传简历'],['template','流程名称'],['candidateResume','上传新版简历']]){
   const html=renderToString(React.createElement(Editor,{modal:{type,appId:'a',candidateId:'c'},data}));assert.ok(html.includes(label),type);assert.equal(html.includes('选择可约时间'),false,type);
  }
 }finally{await vite.close();}
});

test('所有编辑弹窗实际渲染及失效目标降级，创建应聘和面试官空页面不白屏',async()=>{
 const vite=await createServer({server:{middlewareMode:true},appType:'custom',logLevel:'silent'});
 try{
  const {Editor}=await vite.ssrLoadModule('/src/App.jsx'),{CreateApplication}=await vite.ssrLoadModule('/src/CreateApplication.jsx'),{MyInterviews}=await vite.ssrLoadModule('/src/MyInterviews.jsx');
  const {round}=await import('../src/model.js');const data={revision:1,users:[{name:'甲',role:'interviewer'}],candidates:[{id:'c',name:'测试',resumes:[]}],applications:[{id:'a',candidateId:'c',job:'岗位',status:'进行中',screening:{status:'pending',interviewer:'甲'},history:[],rounds:[{...round('初试'),id:'r',interviewer:'甲'}]}],templates:[{id:'t',name:'岗位',nodes:[{name:'初试',interviewer:''}]}]};
  for(const type of ['addRound','screening','screeningDecision','reviewSupplement','endReviewed','end','schedule','feedback','roundReviewer','deleteRound','cancel','return','reassign','candidate','candidateResume','template','deleteTemplate']){
   const props={modal:{type,appId:'a',roundId:'r',candidateId:'c',templateId:'t'},data,role:'甲'};
   assert.doesNotThrow(()=>renderToString(React.createElement(Editor,props)),type);
  }
  for(const type of ['schedule','feedback','addRound','candidate','candidateResume','deleteTemplate']){
   const html=renderToString(React.createElement(Editor,{modal:{type,appId:'gone',roundId:'gone',candidateId:'gone',templateId:'gone'},data}));assert.ok(html.includes('记录已变更'),type);
  }
  for(const templates of [[],data.templates])assert.doesNotThrow(()=>renderToString(React.createElement(CreateApplication,{data:{...data,templates},candidateId:'c'})));
  assert.doesNotThrow(()=>renderToString(React.createElement(MyInterviews,{data:{...data,applications:[],candidates:[]},person:'甲',query:'',date:()=>'',feedbackLabel:()=>''})));
 }finally{await vite.close();}
});
