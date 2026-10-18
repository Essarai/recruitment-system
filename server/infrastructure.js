import fs from 'node:fs';
import mysql from 'mysql2/promise';
import {S3Client,HeadBucketCommand,CreateBucketCommand} from '@aws-sdk/client-s3';
export const bucket=process.env.S3_BUCKET;
for(const key of ['MYSQL_HOST','MYSQL_DATABASE','MYSQL_USER','MYSQL_PASSWORD','MYSQL_SSL_CA_FILE','S3_ENDPOINT','S3_ACCESS_KEY_ID','S3_SECRET_ACCESS_KEY','S3_BUCKET'])if(!process.env[key])throw Error(`Missing server environment variable: ${key}`);
export const pool=mysql.createPool({host:process.env.MYSQL_HOST,port:Number(process.env.MYSQL_PORT||3306),user:process.env.MYSQL_USER,password:process.env.MYSQL_PASSWORD,database:process.env.MYSQL_DATABASE,ssl:{ca:fs.readFileSync(process.env.MYSQL_SSL_CA_FILE),rejectUnauthorized:true,verifyIdentity:process.env.MYSQL_SSL_VERIFY_IDENTITY==='true'},connectionLimit:5,connectTimeout:15000,charset:'utf8mb4',timezone:'Z',enableKeepAlive:true});
export const s3=new S3Client({endpoint:process.env.S3_ENDPOINT,region:process.env.S3_REGION||'us-east-1',forcePathStyle:process.env.S3_FORCE_PATH_STYLE!=='false',credentials:{accessKeyId:process.env.S3_ACCESS_KEY_ID,secretAccessKey:process.env.S3_SECRET_ACCESS_KEY},requestHandler:{connectionTimeout:10000,requestTimeout:20000},maxAttempts:2});
export async function initializeStorage(){
 try{await s3.send(new HeadBucketCommand({Bucket:bucket}));}
 catch(error){if(error.$metadata?.httpStatusCode!==404)throw error;await s3.send(new CreateBucketCommand({Bucket:bucket}));}
}
