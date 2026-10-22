import {parseJSON,emptyFeishuConfig} from './feishu-model.js';
export async function initializeFeishu(pool){
 await pool.query(`CREATE TABLE IF NOT EXISTS recruitment_feishu_config(id TINYINT PRIMARY KEY,revision BIGINT NOT NULL DEFAULT 0,payload JSON NOT NULL)`);
 await pool.execute('INSERT IGNORE INTO recruitment_feishu_config(id,revision,payload) VALUES(1,0,?)',[JSON.stringify(emptyFeishuConfig())]);
 await pool.query(`CREATE TABLE IF NOT EXISTS recruitment_feishu_inbox(event_id VARCHAR(200) PRIMARY KEY,created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
 await pool.query(`CREATE TABLE IF NOT EXISTS recruitment_feishu_jobs(id VARCHAR(200) PRIMARY KEY,kind VARCHAR(12) NOT NULL,application_id VARCHAR(80) NOT NULL,round_id VARCHAR(80) NULL,desired JSON NOT NULL,desired_hash CHAR(64) NOT NULL,applied_hash CHAR(64) NULL,remote JSON NOT NULL,status VARCHAR(20) NOT NULL DEFAULT 'pending',attempts INT NOT NULL DEFAULT 0,error VARCHAR(300) NOT NULL DEFAULT '',next_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,INDEX(application_id),INDEX(status,next_at))`);
}
export async function readFeishuConfig(db,lock=false){
 const [[row]]=await db.query('SELECT revision,payload FROM recruitment_feishu_config WHERE id=1'+(lock?' FOR UPDATE':''));
 const config=row?parseJSON(row.payload):emptyFeishuConfig();
 const [bindings]=await db.execute('SELECT user_id,open_id FROM recruitment_feishu_bindings WHERE app_id=?',[process.env.FEISHU_APP_ID||'']);
 return {config:{...config,bindings:Object.fromEntries(bindings.map(b=>[b.user_id,b.open_id])),pilotUserId:process.env.FEISHU_PILOT_USER_ID||config.pilotUserId||''},revision:Number(row?.revision||0)};
}
export const jobRow=row=>({...row,desired:parseJSON(row.desired),remote:parseJSON(row.remote)});
export async function readJobs(db){const [rows]=await db.query('SELECT * FROM recruitment_feishu_jobs ORDER BY updated_at DESC');return rows.map(jobRow);}
