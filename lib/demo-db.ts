import {PGlite} from '@electric-sql/pglite';
import {mkdirSync} from 'node:fs';
import path from 'node:path';
import {fixtures,DEMO_ID} from './demo-fixtures';
import type {DemoState,Role} from './demo-types';
const collections=['companies','contacts','evidence','approvals','drafts','sends','updates','alerts','events'] as const;
const globalDb=globalThis as unknown as {evoxDB?:Promise<PGlite>};
export async function db(){
 if(!globalDb.evoxDB) globalDb.evoxDB=(async()=>{const dir=process.env.EVOX_DB_PATH||path.join(process.cwd(),'.data','evox-postgres');mkdirSync(path.dirname(dir),{recursive:true});const pg=new PGlite(dir);await pg.waitReady;
 await pg.exec(`CREATE TABLE IF NOT EXISTS campaigns(id text PRIMARY KEY, is_demo boolean NOT NULL DEFAULT true, data jsonb NOT NULL);
 CREATE TABLE IF NOT EXISTS demo_sessions(id text PRIMARY KEY, role text NOT NULL CHECK(role IN ('GM','BDR')));`);
 for(const table of collections)await pg.exec(`CREATE TABLE IF NOT EXISTS ${table}(id text PRIMARY KEY, campaign_id text NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE, data jsonb NOT NULL); CREATE INDEX IF NOT EXISTS ${table}_campaign ON ${table}(campaign_id);`);
 await pg.exec(`CREATE UNIQUE INDEX IF NOT EXISTS alerts_once ON alerts(campaign_id,(data->>'sendId')); CREATE UNIQUE INDEX IF NOT EXISTS sends_draft_once ON sends(campaign_id,(data->>'draftId'));`);
 const exists=await pg.query('SELECT id FROM campaigns WHERE id=$1',[DEMO_ID]);if(!exists.rows.length)await pg.transaction(tx=>save(tx,fixtures()));return pg;})();
 return globalDb.evoxDB;
}
type Queryable=Pick<PGlite,'query'>;
export async function load(tx:Queryable):Promise<DemoState>{
 const result=await tx.query<{data:DemoState['campaign']}>('SELECT data FROM campaigns WHERE id=$1',[DEMO_ID]);
 const state={campaign:result.rows[0].data} as DemoState;
 for(const table of collections){const r=await tx.query<{data:unknown}>(`SELECT data FROM ${table} WHERE campaign_id=$1 ORDER BY id`,[DEMO_ID]);(state[table] as unknown[])=r.rows.map(row=>row.data);}
 return state;
}
export async function save(tx:Queryable,s:DemoState){
 await tx.query('INSERT INTO campaigns(id,is_demo,data) VALUES($1,true,$2) ON CONFLICT(id) DO UPDATE SET data=excluded.data',[s.campaign.id,JSON.stringify(s.campaign)]);
 for(const table of collections)for(const row of s[table])await tx.query(`INSERT INTO ${table}(id,campaign_id,data) VALUES($1,$2,$3) ON CONFLICT(id) DO UPDATE SET data=excluded.data`,[row.id,s.campaign.id,JSON.stringify(row)]);
}
let queue:Promise<unknown>=Promise.resolve();
export function serial<T>(fn:()=>Promise<T>):Promise<T>{const job=queue.then(fn,fn);queue=job.catch(()=>{});return job;}
export async function sessionRole(id:string|undefined):Promise<Role|null>{if(!id)return null;const pg=await db();const r=await pg.query<{role:Role}>('SELECT role FROM demo_sessions WHERE id=$1',[id]);return r.rows[0]?.role??null;}

export async function resetDemo(tx:Queryable,current:DemoState){
 const row=await tx.query<{is_demo:boolean}>('SELECT is_demo FROM campaigns WHERE id=$1',[DEMO_ID]);
 if(current.campaign.id!==DEMO_ID||current.campaign.demo!==true||!row.rows[0]?.is_demo)throw new Error('Reset restricted to demo campaign');
 await tx.query('DELETE FROM campaigns WHERE id=$1 AND is_demo=true',[DEMO_ID]);
 const fresh=fixtures();fresh.campaign.version=current.campaign.version+1;await save(tx,fresh);return fresh;
}
