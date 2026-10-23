import {randomBytes,createHash} from 'node:crypto';
import {db,serial} from '../demo-db';
import {accountMode} from '../auth-mode';
import {verifyPassword,validPasswordHash} from './password.mjs';
import type {Role} from '../demo-types';
export const sessionCookie='evox-demo-session';
export function configuredAccounts(){return (['GM','BDR'] as const).map(role=>({role,email:process.env[`${role}_EMAIL`]?.trim().toLowerCase(),hash:process.env[`${role}_PASSWORD_HASH`]}));}
export function accountsConfigured(){const accounts=configuredAccounts();return accounts.every(a=>a.email&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a.email)&&validPasswordHash(a.hash))&&accounts[0].email!==accounts[1].email;}
export const credentialVersion=(role:Role)=>{const a=configuredAccounts().find(a=>a.role===role)!;return createHash('sha256').update(`${a.email}:${a.role}:${a.hash}`).digest('hex');};
export const cookieSecure=()=>accountMode()&&!(process.env.EVOX_AUTH_HTTP_TEST==='true'&&process.env.EVOX_DB_PATH?.includes('/work/')&&process.env.RENDER!=='true');
export async function loginAccount(email:string,password:string){
 if(!accountMode()||!accountsConfigured())return {ok:false as const,status:503,message:'Hosted accounts are not configured.'};
 const pg=await db();await pg.exec('CREATE TABLE IF NOT EXISTS auth_attempts(id text PRIMARY KEY, attempts int NOT NULL, reset_at timestamptz NOT NULL)');
 const bucket=createHash('sha256').update(email.toLowerCase()).digest('hex');
 const allowed=await serial(async()=>{const count=await pg.query<{attempts:number}>(`INSERT INTO auth_attempts(id,attempts,reset_at) VALUES($1,1,$2) ON CONFLICT(id) DO UPDATE SET attempts=CASE WHEN auth_attempts.reset_at<now() THEN 1 ELSE auth_attempts.attempts+1 END,reset_at=CASE WHEN auth_attempts.reset_at<now() THEN excluded.reset_at ELSE auth_attempts.reset_at END RETURNING attempts`,[bucket,new Date(Date.now()+15*60000).toISOString()]);return count.rows[0].attempts<=5;});
 if(!allowed)return {ok:false as const,status:429,message:'Too many login attempts. Wait fifteen minutes.'};
 const account=configuredAccounts().find(a=>a.email===email.toLowerCase());const dummy='$scrypt$v1$32768$'+'0'.repeat(32)+'$'+'0'.repeat(128);
 const valid=await verifyPassword(password,account?.hash??dummy);if(!valid||!account)return {ok:false as const,status:401,message:'Invalid email or password.'};
 const token=randomBytes(32).toString('base64url'),expiresAt=new Date(Date.now()+8*3600000).toISOString();
 await serial(async()=>{await pg.query('DELETE FROM auth_attempts WHERE id=$1',[bucket]);await pg.query('INSERT INTO account_sessions(id,role,credential_version,expires_at) VALUES($1,$2,$3,$4)',[createHash('sha256').update(token).digest('hex'),account.role,credentialVersion(account.role),expiresAt]);});
 return {ok:true as const,token,role:account.role,expiresAt};
}
export async function logoutAccount(token:string|undefined){if(!token)return;const pg=await db();await pg.query('DELETE FROM account_sessions WHERE id=$1',[createHash('sha256').update(token).digest('hex')]);}
