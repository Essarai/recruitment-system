import {test} from 'node:test';
import assert from 'node:assert/strict';
import {resumePath} from '../src/repository.js';
test('浏览器简历入口使用同源鉴权接口并编码文件 ID，不持久化签名链接',()=>{
 assert.equal(resumePath('file-123'),'/api/resumes/file-123');
 assert.equal(resumePath('../file?token=value'),'/api/resumes/..%2Ffile%3Ftoken%3Dvalue');
});
