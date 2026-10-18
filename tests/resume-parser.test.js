import {test} from 'node:test';
import assert from 'node:assert/strict';
import {resumeFields} from '../server/resume-fields.js';
import {parseResume} from '../server/resume-parser.js';
import {mergeResumeFields} from '../src/model.js';
import {textPDF} from './text-pdf-fixture.js';

test('按明确标签识别个人信息，硕士学历不推断为双九硕等分类',()=>{
 const result=resumeFields('姓名：李明\n手机号：+86 138-0013-8000\n邮箱：li.ming+hr@example.com\n年龄：28岁\n工作年限：5年\n现任公司：示例科技\n当前职位：产品经理\n现居地：杭州\n学历：硕士\n应聘岗位：总监');
 assert.deepEqual(result.fields,{name:'李明',phone:'13800138000',email:'li.ming+hr@example.com',age:'28',experience:'5年',company:'示例科技',currentTitle:'产品经理',city:'杭州'});
 assert.match(result.warnings.join(''),/HR 确认/);assert.equal(result.fields.job,undefined);
 assert.equal(resumeFields('学历：双九硕').fields.education,'双九硕');
});
test('不猜测歧义联系方式、籍贯、历史任职和出生年份；明确标签优先',()=>{
 const ambiguous=resumeFields('个人简历\n13800138000 13900139000\na@example.com b@example.com\n籍贯：上海\n2020年-2023年 示例公司\n出生年份：1998\n毕业院校：清华大学');
 assert.deepEqual(ambiguous.fields,{});assert.equal(ambiguous.warnings.length,2);
 const labeled=resumeFields('联系人：13900139000\n手机号：13800138000\n邮箱：first@example.com\n推荐人：other@example.com');
 assert.equal(labeled.fields.phone,'13800138000');assert.equal(labeled.fields.email,'first@example.com');
 assert.equal(resumeFields('年龄：150岁').fields.age,undefined);
});
test('回填不覆盖手动或原有资料，换文件清除上一份未编辑的自动值',()=>{
 assert.deepEqual(mergeResumeFields({name:'人工姓名',email:'',job:'流程岗位'},{name:'解析姓名',email:'a@example.com',job:'外部岗位'}),{name:'人工姓名',email:'a@example.com',job:'流程岗位'});
 const changed=mergeResumeFields({name:'旧自动姓名',phone:'13800138000',email:''},{name:'新自动姓名',email:'b@example.com'},new Set(['phone','email']),{name:'旧自动姓名',phone:'13800138000'});
 assert.deepEqual(changed,{name:'新自动姓名',phone:'13800138000',email:''});
 assert.deepEqual(mergeResumeFields({name:'旧自动姓名',phone:'人工号码'},{},new Set(['phone']),{name:'旧自动姓名',phone:'旧自动号码'}),{name:'',phone:'人工号码'});
});
test('真实 PDF 文字层可解析，空白/损坏/Word 文件回退手动录入',async()=>{
 const result=await parseResume('resume.pdf',textPDF(['Name: Jane Chen','Phone: 13800138000','Email: jane@example.com','Age: 28','Experience: 5 years','Current company: Example Ltd','Current title: Product Manager','Current city: Hangzhou']));
 assert.equal(result.fields.name,'Jane Chen');assert.equal(result.fields.phone,'13800138000');assert.equal(result.fields.email,'jane@example.com');assert.equal(result.fields.city,'Hangzhou');assert.equal(result.fields.company,'Example Ltd');assert.equal(result.fields.currentTitle,'Product Manager');
 const blank=await parseResume('blank.pdf',textPDF([]));assert.deepEqual(blank.fields,{});assert.match(blank.warnings.join(''),/扫描件/);
 await assert.rejects(parseResume('bad.pdf',Buffer.from('%PDF-1.7\nbroken')),/解析失败/);
 assert.throws(()=>parseResume('cv.docx',Buffer.from('504b0304','hex')),/仅支持 PDF/);
 assert.throws(()=>parseResume('fake.pdf',Buffer.from('not a PDF')),/格式不符/);
});
