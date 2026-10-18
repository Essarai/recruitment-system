import {terminateFailedApplication} from '../src/model.js';
import {canReviewResume} from './screening.js';
import {randomUUID} from 'node:crypto';
import {hashPassword} from './auth.js';
export const emptyState=()=>({candidates:[],applications:[],templates:[]});
export async function initializeDatabase(pool){
 await pool.query(`CREATE TABLE IF NOT EXISTS recruitment_users(id CHAR(36) PRIMARY KEY,username VARCHAR(80) NOT NULL UNIQUE,name VARCHAR(100) NOT NULL UNIQUE,role ENUM('HR','interviewer') NOT NULL,password_hash VARCHAR(200) NOT NULL,created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
 await pool.query(`CREATE TABLE IF NOT EXISTS recruitment_sessions(token_hash CHAR(64) PRIMARY KEY,user_id CHAR(36) NOT NULL,expires_at DATETIME NOT NULL,INDEX(user_id),FOREIGN KEY(user_id) REFERENCES recruitment_users(id) ON DELETE CASCADE)`);
 await pool.query(`CREATE TABLE IF NOT EXISTS recruitment_state(id TINYINT PRIMARY KEY,revision BIGINT NOT NULL DEFAULT 0,payload JSON NOT NULL,updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP)`);
 await pool.query(`CREATE TABLE IF NOT EXISTS recruitment_files(id CHAR(36) PRIMARY KEY,object_key VARCHAR(200) NOT NULL UNIQUE,name VARCHAR(240) NOT NULL,mime VARCHAR(120) NOT NULL,size INT UNSIGNED NOT NULL,owner_id CHAR(36) NOT NULL,created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
 await pool.query(`CREATE TABLE IF NOT EXISTS recruitment_audit(id BIGINT AUTO_INCREMENT PRIMARY KEY,actor_id CHAR(36) NOT NULL,action VARCHAR(200) NOT NULL,target_id VARCHAR(100) NOT NULL,created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
 await pool.query(`CREATE TABLE IF NOT EXISTS recruitment_mcp_tokens(user_id CHAR(36) PRIMARY KEY,token_hash CHAR(64) NOT NULL UNIQUE,token_hint CHAR(8) NOT NULL,created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,expires_at DATETIME NOT NULL,FOREIGN KEY(user_id) REFERENCES recruitment_users(id) ON DELETE CASCADE)`);
 const [scopeColumns]=await pool.query("SHOW COLUMNS FROM recruitment_mcp_tokens LIKE 'can_write'");
 if(!scopeColumns.length)try{await pool.query('ALTER TABLE recruitment_mcp_tokens ADD COLUMN can_write BOOLEAN NOT NULL DEFAULT FALSE');}catch(error){if(error.code!=='ER_DUP_FIELDNAME')throw error;}
 await pool.query(`CREATE TABLE IF NOT EXISTS recruitment_transcripts(file_id CHAR(36) PRIMARY KEY,application_id VARCHAR(80) NOT NULL,round_id VARCHAR(80) NOT NULL,FOREIGN KEY(file_id) REFERENCES recruitment_files(id) ON DELETE CASCADE)`);
 await pool.execute('INSERT IGNORE INTO recruitment_state(id,revision,payload) VALUES(1,0,?)',[JSON.stringify(emptyState())]);
 const connection=await pool.getConnection();
 try{await connection.beginTransaction();await connection.query('SELECT id FROM recruitment_state WHERE id=1 FOR UPDATE');const [[{count}]]=await connection.query('SELECT COUNT(*) AS count FROM recruitment_users');if(!count){if(!process.env.INITIAL_ADMIN_PASSWORD)throw Error('INITIAL_ADMIN_PASSWORD is required to create the first HR account');await connection.execute('INSERT INTO recruitment_users(id,username,name,role,password_hash) VALUES(?,?,?,?,?)',[randomUUID(),process.env.INITIAL_ADMIN_USERNAME||'admin',process.env.INITIAL_ADMIN_NAME||'管理员','HR',await hashPassword(process.env.INITIAL_ADMIN_PASSWORD)]);}const {state}=await readState(connection,true);let corrected=0;
 for(const app of state.applications)if(terminateFailedApplication(app))corrected++;
 if(corrected){await connection.execute('UPDATE recruitment_state SET payload=?,revision=revision+1 WHERE id=1',[JSON.stringify(state)]);console.log('Applied failed-application termination rule:',corrected);}
 await connection.commit();}catch(error){await connection.rollback();throw error;}finally{connection.release();}
}
export async function readState(db,lock=false){const [[row]]=await db.query('SELECT revision,payload FROM recruitment_state WHERE id=1'+(lock?' FOR UPDATE':''));return {revision:Number(row.revision),state:typeof row.payload==='string'?JSON.parse(row.payload):row.payload};}
export async function users(db){const [rows]=await db.query('SELECT id,username,name,role FROM recruitment_users ORDER BY created_at,id');return rows;}
export function visibleState(state,user,userList,revision){
 if(user.role==='HR')return {...structuredClone(state),applications:state.applications.map(a=>({...structuredClone(a),rounds:a.rounds.map(r=>({...structuredClone(r),feedback:['none','draft','returned'].includes(r.feedback.status)?{status:r.feedback.status,returnReason:r.feedback.returnReason||''}:r.feedback}))})),users:userList,revision};
 const applications=state.applications.filter(a=>canReviewResume(a,user)||a.rounds.some(r=>r.time&&r.interviewer===user.name)).map(a=>({...a,screening:canReviewResume(a,user)?a.screening:undefined,reason:'',history:[],rounds:a.rounds.filter(r=>r.time&&r.interviewer===user.name).map(r=>{const {feedbackVersions,...own}=r;return own;})}));
 const ids=new Set(applications.map(a=>a.candidateId));
 return {candidates:state.candidates.filter(c=>ids.has(c.id)).map(c=>{const {notes,...safe}=c;return safe;}),applications,templates:[],users:[user],revision};
}
