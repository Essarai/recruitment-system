import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validatePortfolios,validatePortfolioFile} from '../server/portfolio.js';
import {applyCandidateChange} from '../server/candidate-save.js';
test('作品可选，多作品须有名称且链接附件至少一个，拒绝危险链接与伪造附件',()=>{
 assert.equal(validatePortfolios(undefined,[]),undefined);assert.deepEqual(validatePortfolios([],[]),[]);
 assert.throws(()=>validatePortfolios([{name:'作品'}],[]),/至少/);assert.throws(()=>validatePortfolios([{name:'',url:'https://example.com'}],[]),/名称/);
 for(const url of ['javascript:alert(1)','file:///tmp/test','https://user:pass@example.com'])assert.throws(()=>validatePortfolios([{name:'作品',url}],[]));
 assert.throws(()=>validatePortfolios([{name:'作品',attachment:{id:'fake'}}],[]),/附件/);
 const file={id:'f',name:'作品.pdf',mime:'application/pdf',size:12,object_key:'portfolios/f.pdf'};
 const saved=validatePortfolios([{name:'作品',attachment:{id:'f',name:'伪造'},description:'简介'},{name:'网站',url:'https://example.com'}],[file]);assert.equal(saved.length,2);assert.equal(saved[0].attachment.name,file.name);
});
test('作品附件格式和大小校验',()=>{
 for(const [name,signature] of [['a.pdf','25504446'],['a.ppt','d0cf11e0'],['a.pptx','504b0304'],['a.zip','504b0304'],['a.png','89504e470d0a1a0a'],['a.jpg','ffd8ff']])assert.ok(validatePortfolioFile(name,Buffer.from(signature,'hex')).type);
 for(const [name,buffer] of [['a.exe',Buffer.from('bad')],['a.pdf',Buffer.from('fake')],['../a.pdf',Buffer.from('%PDF')],['a.pdf',Buffer.alloc(0)]])assert.throws(()=>validatePortfolioFile(name,buffer));
});
