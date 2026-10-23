import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import path from 'node:path';
import {db,sessionRole} from '../lib/demo-db';
import {accountsConfigured,loginAccount,logoutAccount,cookieSecure} from '../lib/server/accounts';
import {hashPassword,verifyPassword} from '../lib/server/password.mjs';
test('hosted accounts enforce assigned roles, hashed sessions, expiry, rotation, logout and persistent throttling',async()=>{
 await mkdir('work',{recursive:true});const directory=await mkdtemp(path.resolve('work/accounts-test-'));process.env.EVOX_DB_PATH=path.join(directory,'pg');process.env.EVOX_AUTH_MODE='accounts';process.env.GM_EMAIL='gm@example.org';process.env.BDR_EMAIL='bdr@example.org';const gmPassword=randomBytes(24).toString('hex'),bdrPassword=randomBytes(24).toString('hex');process.env.GM_PASSWORD_HASH=await hashPassword(gmPassword);process.env.BDR_PASSWORD_HASH=await hashPassword(bdrPassword);const pg=await db();
 try{assert.equal(accountsConfigured(),true);assert.equal(cookieSecure(),true);assert.equal(await verifyPassword('incorrect',process.env.GM_PASSWORD_HASH),false);const gm=await loginAccount(process.env.GM_EMAIL,gmPassword),bdr=await loginAccount(process.env.BDR_EMAIL,bdrPassword);assert.ok(gm.ok&&bdr.ok);if(!gm.ok||!bdr.ok)throw new Error('Synthetic login failed.');assert.equal(await sessionRole(gm.token),'GM');assert.equal(await sessionRole(bdr.token),'BDR');const saved=await pg.query<{id:string}>('SELECT id FROM account_sessions');assert.ok(saved.rows.every(row=>row.id!==gm.token&&row.id!==bdr.token));await pg.query('INSERT INTO demo_sessions(id,role) VALUES($1,$2)',['untrusted-demo-cookie','GM']);assert.equal(await sessionRole('untrusted-demo-cookie'),null);
 await logoutAccount(bdr.token);assert.equal(await sessionRole(bdr.token),null);process.env.GM_PASSWORD_HASH=await hashPassword(gmPassword);assert.equal(await sessionRole(gm.token),null);const next=await loginAccount(process.env.GM_EMAIL,gmPassword);assert.ok(next.ok);await pg.query('UPDATE account_sessions SET expires_at=$1',['2000-01-01T00:00:00Z']);if(next.ok)assert.equal(await sessionRole(next.token),null);
 for(let n=0;n<5;n++)assert.equal((await loginAccount('unknown@example.org','wrong-password')).status,401);const limited=await loginAccount('unknown@example.org','wrong-password');assert.equal(limited.status,429);const bucketCount=await pg.query<{count:number}>('SELECT count(*)::int AS count FROM auth_attempts');assert.ok(bucketCount.rows[0].count>0);
 delete process.env.GM_PASSWORD_HASH;assert.equal(accountsConfigured(),false);assert.equal((await loginAccount(process.env.GM_EMAIL,gmPassword)).status,503);
 }finally{await pg.close();delete (globalThis as {evoxDB?:unknown}).evoxDB;for(const key of ['EVOX_AUTH_MODE','GM_EMAIL','GM_PASSWORD_HASH','BDR_EMAIL','BDR_PASSWORD_HASH'])delete process.env[key];await rm(directory,{recursive:true,force:true});}
});
