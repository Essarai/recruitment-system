import {educationOptions,validateContacts} from '../src/model.js';

export function resumeFields(text){
 const source=text.normalize('NFKC').replace(/\r/g,'\n');
 const fields={},warnings=[];
 const labelValue=labels=>source.match(new RegExp(`(?:^|[\\n|;\\t ])(?:${labels})\\s*[:：]\\s*([^\\n|;]{1,160})`,'im'))?.[1]?.split(/\s+(?:性别|年龄|学历|手机|电话|邮箱|工作经验|现任公司|当前职位|现居地)\s*[:：]/)[0]?.trim();
 const name=labelValue('姓\\s*名|候选人|Name|Full name');
 if(name&&/^(?:[\p{Script=Han}·]{2,12}|[A-Za-z][A-Za-z .'-]{1,60})$/u.test(name)&&!/(姓名|性别|年龄|学历|手机|电话|邮箱)/.test(name))fields.name=name;
 if(!fields.name){const header=source.split('\n').map(s=>s.trim()).filter(Boolean).slice(0,3).find(s=>/^[\p{Script=Han}·]{2,4}$/u.test(s)&&!/(简历|经理|工程|开发|设计|经历|经验|信息|教育|联系|意向|技能|简介|本科|硕士|博士)/.test(s));if(header)fields.name=header;}
 const phonePattern=/(?<!\d)(?:\+?86[\s-]?)?1[3-9](?:[\t -]?\d){9}(?!\d)/g;
 const emailPattern=/[A-Za-z0-9!#$%&'*+\/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+\/=?^_`{|}~-]+)*@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?\.[A-Za-z]{2,63}/g;
 for(const [key,labels,pattern] of [['phone','手机号|手机|联系电话|电话|Mobile|Phone',phonePattern],['email','邮箱|电子邮箱|电子邮件|E-?mail',emailPattern]]){
  const find=value=>[...new Set((value.match(pattern)||[]).map(v=>key==='phone'?v.replace(/\D/g,'').slice(-11):v))].filter(v=>{try{validateContacts({[key]:v});return true;}catch{return false;}});
  const labeled=find(labelValue(labels)||''),values=labeled.length?labeled:find(source);
  if(values.length===1)fields[key]=values[0];else if(values.length>1)warnings.push(`识别到多个${key==='phone'?'手机号':'邮箱'}，请手动确认`);
 }
 const age=labelValue('年龄|Age')?.match(/^(\d{1,3})(?:\s*岁)?(?:\s|$)/)?.[1];if(age&&Number(age)<=120)fields.age=age;
 const experience=labelValue('工作年限|工作经验|工作经历年限|Experience')?.match(/^(\d{1,2}(?:\.\d)?\s*(?:年|years?))(?:\s|$)/i)?.[1]||source.match(/(?:^|\s)(\d{1,2}(?:\.\d)?\s*年)工作经验/)?.[1];if(experience)fields.experience=experience;
 for(const [key,labels] of [['company','现任公司|当前公司|目前就职|Current company'],['currentTitle','当前职位|现任职位|Current title'],['city','现居地|现居城市|现居住地|所在城市|目前所在地|Current city']]){const value=labelValue(labels);if(value&&value.length<=100)fields[key]=value;}
 const education=labelValue('最高学历|学历|Education');
 if(educationOptions.includes(education))fields.education=education;
 const educationHint=education?.match(/博士|硕士|研究生|本科|大专|专科/)?.[0]||'';
 if(educationHint&&!fields.education)warnings.push(`识别到学历“${educationHint}”，请 HR 确认必填学历分类`);
 return {fields,warnings};
}
