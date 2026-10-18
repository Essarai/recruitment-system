import {test} from 'node:test';
import assert from 'node:assert/strict';
import {interviewPrompt} from '../src/mcp-prompt.js';
test('预设提示词包含实际地址、Codex 配置、匹配确认和草稿上传步骤，只拼接用户明确提供的 Token',()=>{
 const token='recruit_mcp_'+'a'.repeat(64),prompt=interviewPrompt('https://recruitment.example/mcp',token);
 for(const value of ['https://recruitment.example/mcp','http_headers','Bearer '+token,'revision','confirmed=true','save_my_feedback_draft','upload_my_transcript','正式提交须由我','有多个可能时先问我'])assert.ok(prompt.includes(value),value);
 assert.throws(()=>interviewPrompt('https://recruitment.example/mcp'),/先创建个人 Token/);
 assert.throws(()=>interviewPrompt('https://recruitment.example/mcp','invalid'),/先创建个人 Token/);
});
