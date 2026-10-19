import {resumeSearchTerms} from '../src/resume-search.js';
import {isRecruiter} from '../src/permissions.js';
import {applicationStage,candidateResumes} from '../src/model.js';
import {isDeepStrictEqual} from 'node:util';

export function candidateSummary(c){return Object.fromEntries(['id','name','phone','email','age','education'].map(k=>[k,c[k]??'']).concat([['_summary',true]]));}
export function compactCandidates(state,ids=[]){
 const linked=new Set(state.applications.map(a=>a.candidateId)),full=new Set(ids.slice(0,20));
 return {...state,partialCandidates:true,candidateTotal:state.candidates.length,candidates:state.candidates.filter(c=>linked.has(c.id)||full.has(c.id)).map(c=>full.has(c.id)?c:candidateSummary(c))};
}
export function mergePartialCandidates(previous,input){
 if(input.partialCandidates!==true)return input;
 if(!Array.isArray(input.candidates)||input.candidates.length>20000)throw Error('候选人无效');
 const old=new Map(previous.candidates.map(c=>[c.id,c])),patches=new Map();
 for(const c of input.candidates){if(patches.has(c.id))throw Error('候选人含重复 ID');if(c._summary){if(!old.has(c.id)||!isDeepStrictEqual(c,candidateSummary(old.get(c.id))))throw Error('请重新加载候选人完整资料后编辑');patches.set(c.id,old.get(c.id));}else patches.set(c.id,c);}
 return {...input,candidates:[...previous.candidates.map(c=>patches.get(c.id)||c),...input.candidates.filter(c=>!old.has(c.id))]};
}
const json=value=>typeof value==='string'?JSON.parse(value):value;
const num='[0-9]+([.][0-9]+)?';
// MySQL evaluates the search and LIMIT against the existing canonical JSON; no second source of truth.
export function resumeSearchSQL(query){
 const terms=resumeSearchTerms(query),where=[],params=[];
 if(String(query||'').length>500||terms.length>20)throw Object.assign(Error('搜索内容过长，请减少条件'),{status:400});
 for(const term of terms){if(term.kind==='keyword'){where.push("search_text COLLATE utf8mb4_0900_as_ci LIKE ? ESCAPE '!'");params.push('%'+term.token.replace(/[!%_]/g,'!$&')+'%');}else{if(term.op){where.push(`${term.op.startsWith('>')?'exp_low':'exp_high'} ${term.op} ?`);params.push(term.years);}else{where.push('exp_low >= ? AND exp_high <= ?');params.push(term.min,Number.isFinite(term.max)?term.max:1e308);}}}
 const fields=['name','phone','email','company','currentTitle','city','highestEducation','education','notes'];
 const concat=fields.map(k=>`COALESCE(JSON_UNQUOTE(JSON_EXTRACT(profile,'$.${k}')),'')`).join(",' ',");
 let exp="LOWER(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(profile,'$.experience')),''))";
 for(let n=0;n<=9;n++)exp=`REPLACE(${exp},'${String.fromCharCode(0xff10+n)}','${n}')`;
 for(const [a,b] of [['．','.'],['－','-'],['ｙ','y'],['ｅ','e'],['ａ','a'],['ｒ','r'],['ｓ','s']])exp=`REPLACE(${exp},'${a}','${b}')`;
 const cte=`WITH raw AS (SELECT s.revision,j.ord,j.profile,CONCAT(${concat}) AS search_text,REGEXP_REPLACE(${exp},'(工作经验|工作年限|工作经历|经验|years?|[[:space:]])','') AS exp FROM recruitment_state s JOIN JSON_TABLE(s.payload,'$.candidates[*]' COLUMNS(ord FOR ORDINALITY,profile JSON PATH '$')) j WHERE s.id=1),parsed AS (SELECT raw.*,REGEXP_SUBSTR(exp,'${num}') AS first_num,REGEXP_SUBSTR(exp,'${num}',1,2) AS second_num,REGEXP_LIKE(exp,'^${num}[-–—~～至]${num}年?$') AS is_range,REGEXP_LIKE(exp,'^${num}年?(及以上|及以下|以上|以下)?$') AS is_single,exp IN ('应届','应届毕业生','无工作','无') AS is_zero FROM raw),bounds AS (SELECT parsed.*,CASE WHEN is_zero OR (is_single AND exp LIKE '%以下') THEN 0 ELSE CAST(first_num AS DOUBLE) END AS exp_low,CASE WHEN is_zero THEN 0 WHEN is_range THEN CAST(second_num AS DOUBLE) WHEN is_single AND exp LIKE '%以上' THEN 1e308 ELSE CAST(first_num AS DOUBLE) END AS exp_high FROM parsed),matched AS (SELECT * FROM bounds WHERE ${where.join(' AND ')||'1=1'} ${terms.some(t=>t.kind==='experience')?'AND (is_zero OR is_single OR is_range) AND exp_low <= exp_high':''})`;
 return {cte,params};
}
export async function searchResumeLibrary(pool,query={}){
 const size=Number(query.size??20),requested=Number(query.page??1);
 if(![10,20,50].includes(size)||!Number.isSafeInteger(requested)||requested<1)throw Object.assign(Error('分页参数无效'),{status:400});
 const {cte,params}=resumeSearchSQL(query.q||''),conn=await pool.getConnection();
 try{await conn.beginTransaction();const [[count]]=await conn.query(cte+' SELECT COUNT(*) AS total,(SELECT JSON_LENGTH(payload,\'$.candidates\') FROM recruitment_state WHERE id=1) AS libraryTotal FROM matched',params);
 const total=Number(count.total),pages=Math.max(1,Math.ceil(total/size)),page=Math.min(requested,pages);
 const [rows]=await conn.query(cte+' SELECT profile,revision FROM matched ORDER BY ord LIMIT ? OFFSET ?',[...params,size,(page-1)*size]);
 const candidates=rows.map(r=>json(r.profile)),ids=candidates.map(c=>c.id);let applications=[];
 if(ids.length){const [apps]=await conn.query(`SELECT j.app FROM recruitment_state s JOIN JSON_TABLE(s.payload,'$.applications[*]' COLUMNS(app JSON PATH '$',candidateId VARCHAR(80) PATH '$.candidateId')) j WHERE s.id=1 AND j.candidateId IN (${ids.map(()=>'?').join(',')})`,ids);applications=apps.map(r=>json(r.app));}
 const [[version]]=await conn.query('SELECT revision FROM recruitment_state WHERE id=1');await conn.commit();
 return {total,libraryTotal:Number(count.libraryTotal),page,pages,size,revision:Number(version.revision),items:candidates.map(candidate=>{const apps=applications.filter(a=>a.candidateId===candidate.id),current=apps.find(a=>a.status==='进行中')||apps[0],{name,tone}=applicationStage(current);return {candidate,applicationCount:apps.length,active:apps.some(a=>a.status==='进行中'),job:current?.job||'',stage:{name,tone},files:candidateResumes(candidate,apps)};})};
 }catch(e){await conn.rollback();throw e;}finally{conn.release();}
}
export function mountResumeLibrary(app,{pool}){
 const allowed=(req,res)=>{if(isRecruiter(req.user))return true;res.status(403).json({error:'仅管理员或 HR 可以查看简历库'});return false;};
 app.get('/api/candidates',async(req,res)=>{if(!allowed(req,res))return;res.json(await searchResumeLibrary(pool,req.query));});
 app.get('/api/candidates/:id',async(req,res)=>{if(!allowed(req,res))return;const [rows]=await pool.query("SELECT s.revision,j.profile FROM recruitment_state s JOIN JSON_TABLE(s.payload,'$.candidates[*]' COLUMNS(profile JSON PATH '$',id VARCHAR(80) PATH '$.id')) j WHERE s.id=1 AND j.id=?",[req.params.id]);if(!rows.length)return res.status(404).json({error:'候选人不存在，请刷新简历库'});res.json({candidate:json(rows[0].profile),revision:Number(rows[0].revision)});});
}
