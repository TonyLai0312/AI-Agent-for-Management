import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {db,load,save,resetDemo} from '../lib/demo-db';
import {applyAction,actionSchema} from '../lib/demo-service';
import type {DemoState} from '../lib/demo-types';
test('PostgreSQL persists every record class across close/reopen; safe reset preserves non-demo campaigns',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'evox-db-test-'));process.env.EVOX_DB_PATH=path.join(dir,'pg');
 const globalDb=globalThis as unknown as {evoxDB?:unknown};
 let pg=await db();
 try{
 await pg.query('INSERT INTO campaigns(id,is_demo,data) VALUES($1,false,$2)',['non-demo-sentinel',JSON.stringify({name:'Do not delete'})]);
 await pg.query('INSERT INTO companies(id,campaign_id,data) VALUES($1,$2,$3)',['sentinel-company','non-demo-sentinel',JSON.stringify({name:'Protected account'})]);
 await pg.transaction(async tx=>{const s=await load(tx);applyAction(s,actionSchema.parse({action:'check-alerts',version:s.campaign.version}),'GM');applyAction(s,actionSchema.parse({action:'status',version:s.campaign.version,companyId:'overdue',sendId:'send-overdue',status:'accepted'}),'BDR');await save(tx,s)});
 const before=await load(pg);assert.equal(before.alerts.length,1);assert.equal(before.updates.length,1);assert.ok(before.alerts[0].resolvedAt);
 const counts:Record<string,number>={};for(const table of ['campaigns','companies','contacts','evidence','approvals','drafts','sends','updates','alerts','events'])counts[table]=Number((await pg.query<{count:string}>(`SELECT count(*) FROM ${table}`)).rows[0].count);
 await pg.close();delete globalDb.evoxDB;pg=await db();assert.deepEqual(await load(pg),before);
 for(const [table,count] of Object.entries(counts))assert.equal(Number((await pg.query<{count:string}>(`SELECT count(*) FROM ${table}`)).rows[0].count),count);
 await pg.transaction(async tx=>resetDemo(tx,await load(tx)));
 assert.equal((await pg.query('SELECT id FROM campaigns WHERE id=$1',['non-demo-sentinel'])).rows.length,1);assert.equal((await pg.query('SELECT id FROM companies WHERE id=$1',['sentinel-company'])).rows.length,1);
 const fresh=await load(pg);assert.equal(fresh.companies.length,5);assert.equal(fresh.alerts.length,0);assert.equal(fresh.updates.length,0);assert.equal(fresh.sends.length,1);
 await pg.query('UPDATE campaigns SET is_demo=false WHERE id=$1',[fresh.campaign.id]);await assert.rejects(()=>pg.transaction(tx=>resetDemo(tx,fresh)),/restricted/);
 console.log('Verified disk persistence for tables:',Object.keys(counts).join(', '));
 }finally{await pg.close();delete globalDb.evoxDB;await rm(dir,{recursive:true,force:true})}
});
