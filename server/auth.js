import {randomBytes,scrypt as scryptCallback,timingSafeEqual,createHash} from 'node:crypto';
import {promisify} from 'node:util';
const scrypt=promisify(scryptCallback);
export function validatePassword(password){if(typeof password!=='string'||password.length<12||password.length>128)throw Error('密码长度须为 12 至 128 位');}
export async function hashPassword(password){validatePassword(password);const salt=randomBytes(16).toString('hex');const key=await scrypt(password,salt,64);return `${salt}:${key.toString('hex')}`;}
export async function verifyPassword(password,hash){if(typeof password!=='string'||password.length>128)return false;const [salt,expected]=hash.split(':');const actual=await scrypt(password,salt,64);const stored=Buffer.from(expected,'hex');return actual.length===stored.length&&timingSafeEqual(actual,stored);}
export const tokenHash=token=>createHash('sha256').update(token).digest('hex');
export const sessionToken=()=>randomBytes(32).toString('hex');
export function getSessionCookie(req){return (req.headers.cookie||'').split(';').map(v=>v.trim()).find(v=>v.startsWith('recruitment_session='))?.slice('recruitment_session='.length)||'';}
export function setSessionCookie(res,token){res.cookie('recruitment_session',token,{httpOnly:true,sameSite:'strict',secure:process.env.COOKIE_SECURE==='true'||process.env.NODE_ENV==='production',maxAge:8*60*60*1000,path:'/api'});}
