import {createHash} from 'node:crypto';
export const directoryVersion=users=>createHash('sha256').update(JSON.stringify([...users].sort((a,b)=>a.id.localeCompare(b.id)))).digest('hex');
export async function readVersion(pool){
 const [[[row]],[users]]=await Promise.all([pool.query('SELECT revision FROM recruitment_state WHERE id=1'),pool.query('SELECT id,username,name,role,frozen FROM recruitment_users ORDER BY id')]);
 return {revision:Number(row.revision),directoryVersion:directoryVersion(users)};
}
