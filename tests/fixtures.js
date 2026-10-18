import {round} from '../src/model.js';
export const people=['陈晨','周宁','李强'];
export function seed(){
 const names=['林晓','陈可','周悦','许安','李然','王宁','赵晴','刘洋'];
 const jobs=['产品经理','前端工程师','UI设计师','产品经理','运营专员','后端工程师','项目经理','测试工程师'];
 const candidates=names.map((name,i)=>({id:'c'+i,name,phone:'1380000000'+i,email:'demo'+i+'@example.com'}));
 const applications=names.map((_,i)=>({id:'a'+i,candidateId:'c'+i,job:jobs[i],status:i===3?'公司决定录用':i===4?'候选人退出':i===7?'未录用':'进行中',reason:i===3?'示例：公司确认录用':i===4?'示例：候选人个人安排':i===7?'示例：岗位匹配度不足':'',rounds:['初试','复试','终试'].map(round),resume:null,history:[]}));
 const set=(i,j,time,interviewer)=>Object.assign(applications[i].rounds[j],{time,interviewer,mode:'线上',location:'https://meeting.example.com/demo',focus:'需求分析与沟通协作'});
 set(0,0,'2026-10-15T10:00','陈晨');set(0,1,'2026-10-20T14:00','周宁');set(1,0,'2026-10-19T10:00','陈晨');set(5,2,'2026-10-21T15:00','李强');set(6,1,'2026-10-22T10:00','周宁');
 return {version:1,candidates,applications,templates:[{id:'t1',name:'标准三轮面试',nodes:['初试','复试','终试']},{id:'t2',name:'简洁两轮面试',nodes:['初试','复试']}]};
}
