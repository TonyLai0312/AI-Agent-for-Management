import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm} from 'node:fs/promises';
import path from 'node:path';
import {workingDeadline,defaultCalendar,type ProviderEvidence} from '../lib/monitoring';
import {db,load,resetDemo} from '../lib/demo-db';
import {monitoringSnapshot,configureCalendar,setTestClock,seedTestInvitation,updateTestStatus,runOverdue,refreshProviderEvidence,retryAlert} from '../lib/server/monitor-store';
import {authorizeMonitor} from '../lib/server/monitor-auth';
import {GmailError,type AlertEmailProvider} from '../lib/server/gmail-alerts';
const proof=(operation:ProviderEvidence['operation']):ProviderEvidence=>({at:new Date().toISOString(),operation,realProvider:false,httpStatus:200,providerId:operation==='send'?'explicit-provider-fixture':null,requestId:null,code:null,lastEvent:null});
test('five working days preserves local wall time, calendar exceptions and DST, independently of machine timezone',()=>{
 assert.equal(workingDeadline('2026-10-16T02:00:00Z',defaultCalendar),'2026-10-23T02:00:00.000Z');
 assert.equal(workingDeadline('2026-10-18T17:25:30Z',defaultCalendar),'2026-10-25T17:25:30.000Z');
 assert.equal(workingDeadline('2026-10-16T02:00:00Z',{...defaultCalendar,holidays:['2026-10-19']}),'2026-10-26T02:00:00.000Z');
 assert.equal(workingDeadline('2026-10-16T02:00:00Z',{...defaultCalendar,weekdays:[1,2,3,4,5,6]}),'2026-10-22T02:00:00.000Z');
 assert.equal(workingDeadline('2026-03-02T14:30:00Z',{...defaultCalendar,timezone:'America/New_York'}),'2026-03-09T13:30:00.000Z');
 assert.equal(workingDeadline('2026-10-26T13:30:00Z',{...defaultCalendar,timezone:'America/New_York'}),'2026-11-02T14:30:00.000Z');
 // Gap/overlap policy is deterministic when all days are working days.
 assert.equal(workingDeadline('2026-03-03T07:30:00Z',{...defaultCalendar,timezone:'America/New_York',weekdays:[1,2,3,4,5,6,7]}),'2026-03-08T07:30:00.000Z');
 assert.throws(()=>workingDeadline('2026-01-01T00:00:00Z',{...defaultCalendar,weekdays:[]}));
});
test('admin/scheduler authorization fails closed, including demo-role cookies and test clock isolation',()=>{
 const old=process.env.EVOX_ADMIN_SECRET,cron=process.env.CRON_SECRET;delete process.env.EVOX_ADMIN_SECRET;assert.throws(()=>authorizeMonitor(new Request('http://localhost'),'admin'),/must be configured/);
 process.env.EVOX_ADMIN_SECRET='a'.repeat(40);process.env.CRON_SECRET='c'.repeat(40);
 try{assert.throws(()=>authorizeMonitor(new Request('http://localhost',{headers:{Cookie:'evox-demo-session=GM'}}),'admin'),/authentication required/);assert.throws(()=>authorizeMonitor(new Request('http://localhost',{headers:{Authorization:'Bearer '+process.env.EVOX_ADMIN_SECRET}}),'cron'),/authentication required/);authorizeMonitor(new Request('http://localhost',{headers:{Authorization:'Bearer '+process.env.CRON_SECRET}}),'cron');}finally{if(old===undefined)delete process.env.EVOX_ADMIN_SECRET;else process.env.EVOX_ADMIN_SECRET=old;if(cron===undefined)delete process.env.CRON_SECRET;else process.env.CRON_SECRET=cron;}
});
test('persistent monitoring claims once, freezes deadlines, rechecks status, reconciles ambiguous sends and never repeats escalation',async()=>{
 await mkdir('work',{recursive:true});const directory=await mkdtemp(path.resolve('work/monitor-test-'));process.env.EVOX_DB_PATH=path.join(directory,'pg');process.env.EVOX_ENABLE_MONITOR_TESTS='true';let pg=await db();let preparations=0,sends=0,lookups=0,ambiguous=false,found=true;
 const provider:AlertEmailProvider={realProvider:false,configuration:()=>({from:'sender@example.org',to:'test@example.org'}),prepare:async()=>{preparations++;return {draftId:'fixture-draft',evidence:proof('prepare')};},send:async()=>{sends++;if(ambiguous)throw new GmailError('network','Synthetic ambiguous provider result',{...proof('send'),httpStatus:null,code:'network'},true);return {providerId:'explicit-provider-fixture',evidence:proof('send')};},lookup:async()=>{lookups++;return {providerId:found?'explicit-provider-fixture':null,evidence:proof('retrieve')};}};
 try{
 await setTestClock('2026-10-23T01:59:59Z');let view=await seedTestInvitation('2026-10-16T02:00:00Z');const id=view.invitations[0].id;
 await configureCalendar('test',{timezone:'America/New_York',weekdays:[1,2,3,4],holidays:['2026-10-23']});view=await monitoringSnapshot('test');assert.equal(view.invitations[0].dueAt,'2026-10-23T02:00:00.000Z');assert.equal(view.invitations[0].calendar.timezone,'Asia/Singapore');await configureCalendar('test',{timezone:'Asia/Singapore',weekdays:[1,2,3,4,5],holidays:[]});
 view=await runOverdue('test',provider);assert.equal(view.alerts.length,0);assert.equal(sends,0);await setTestClock('2026-10-23T02:00:00Z');await Promise.all([runOverdue('test',provider),runOverdue('test',provider),runOverdue('test',provider)]);view=await monitoringSnapshot('test');assert.equal(sends,1);assert.equal(preparations,1);assert.equal(view.alerts.length,1);assert.equal(view.alerts[0].state,'provider-accepted');assert.ok(view.alerts[0].evidence.every(e=>e.realProvider===false));
 await updateTestStatus(id,'checked/pending');await setTestClock('2027-01-01T00:00:00Z');view=await runOverdue('test',provider);assert.equal(view.alerts.length,1);assert.equal(view.alerts[0].state,'resolved');assert.equal(view.invitations[0].status,'checked/pending');assert.equal(sends,1);assert.equal((await monitoringSnapshot('live')).invitations.length,0);
 // A deliberate pre-deadline pending update satisfies the initial check forever.
 view=await seedTestInvitation('2026-10-16T02:00:00Z');const pending=view.invitations.find(i=>i.id!==id)!.id;await updateTestStatus(pending,'checked/pending');await runOverdue('test',provider);assert.equal(sends,1);
 // An update queued while the email draft is being prepared wins the final pre-send check.
 view=await seedTestInvitation('2026-10-16T02:00:00Z');const recheckId=view.invitations.find(i=>![id,pending].includes(i.id))!.id;let release!:()=>void,entered!:()=>void;const ready=new Promise<void>(r=>entered=r),wait=new Promise<void>(r=>release=r);
 const held={...provider,prepare:async()=>{entered();await wait;return {draftId:'held-draft',evidence:proof('prepare')};}};const running=runOverdue('test',held);await ready;const updating=updateTestStatus(recheckId,'accepted');release();await Promise.all([running,updating]);assert.equal(sends,1);assert.equal((await monitoringSnapshot('test')).alerts.find(a=>a.send_id===recheckId)?.state,'resolved');
 // Gmail POST is never retried after an ambiguous result. Only provider evidence is queried.
 view=await seedTestInvitation('2026-10-16T02:00:00Z');const uncertainId=view.invitations.find(i=>![id,pending,recheckId].includes(i.id))!.id;ambiguous=true;view=await runOverdue('test',provider);assert.equal(sends,2);assert.equal(view.alerts.find(a=>a.send_id===uncertainId)?.state,'failed');const key=view.alerts.find(a=>a.send_id===uncertainId)!.idempotency_key;
 found=false;await retryAlert('test',uncertainId);view=await runOverdue('test',provider);assert.equal(sends,2);assert.equal(view.alerts.find(a=>a.send_id===uncertainId)?.state,'failed');found=true;await retryAlert('test',uncertainId);view=await runOverdue('test',provider);assert.equal(sends,2);assert.equal(lookups,2);assert.equal(view.alerts.find(a=>a.send_id===uncertainId)?.state,'provider-accepted');assert.equal(view.alerts.find(a=>a.send_id===uncertainId)?.idempotency_key,key);
 await updateTestStatus(uncertainId,'declined');view=await refreshProviderEvidence('test',uncertainId,provider);assert.equal(view.alerts.find(a=>a.send_id===uncertainId)?.state,'resolved');assert.equal(sends,2);
 // Missing configuration is explicit; neither a fake acceptance nor fallback delivery is saved.
 ambiguous=false;view=await seedTestInvitation('2026-10-16T02:00:00Z');const last=view.invitations.find(i=>![id,pending,recheckId,uncertainId].includes(i.id))!.id;const missing={...provider,configuration:()=>{throw new Error('sensitive raw provider body');}};view=await runOverdue('test',missing);assert.equal(view.alerts.find(a=>a.send_id===last)?.state,'failed');assert.equal(JSON.stringify(view).includes('sensitive raw'),false);
 const preserved=await monitoringSnapshot('test');await pg.transaction(async tx=>resetDemo(tx,await load(tx)));assert.deepEqual((await monitoringSnapshot('test')).invitations,preserved.invitations);await pg.close();delete (globalThis as {evoxDB?:unknown}).evoxDB;pg=await db();view=await monitoringSnapshot('test');assert.deepEqual(view.invitations,preserved.invitations);assert.ok(view.alerts.find(a=>a.send_id===id)?.evidence.length);
 delete process.env.EVOX_ENABLE_MONITOR_TESTS;await assert.rejects(()=>setTestClock('2030-01-01T00:00:00Z'),/disabled/);assert.equal((await monitoringSnapshot('live')).invitations.length,0);
 }finally{await pg.close();delete (globalThis as {evoxDB?:unknown}).evoxDB;delete process.env.EVOX_ENABLE_MONITOR_TESTS;await rm(directory,{recursive:true,force:true});}
});

test('legacy explicit pending updates migrate as satisfied, while automatic pending never becomes a checked update',async()=>{
 const {syncLiveInvitations,ensureMonitor}=await import('../lib/server/monitor-store');await mkdir('work',{recursive:true});const directory=await mkdtemp(path.resolve('work/monitor-migration-'));process.env.EVOX_DB_PATH=path.join(directory,'pg');const pg=await db();
 try{
 const at='2026-10-17T02:00:00Z',recordedAt='2026-10-16T02:00:00Z';
 const c={id:'legacy-company',name:'Explicit legacy test company',contacts:[],outreach:{contacts:{legacy:{status:'checked/pending',updatedAt:at,reviewer:'Test BDR',note:'Actually checked the pending invitation.',history:null},automatic:{status:'checked/pending',updatedAt:recordedAt,reviewer:'Test BDR',note:'Manual invitation send recorded; pending response.',history:null}},sends:[{id:'legacy-checked',channel:'connection',contactKey:'legacy',sentAt:recordedAt,recordedAt,recordedBy:'Test BDR'},{id:'legacy-auto',channel:'connection',contactKey:'automatic',sentAt:recordedAt,recordedAt,recordedBy:'Test BDR'}]}};
 const w={companies:[c],events:[{action:'outreach-status',companyId:c.id,at,detail:JSON.stringify({status:'checked/pending',reviewer:'Test BDR',note:'Actually checked the pending invitation.'})}]} as unknown as import('../lib/prospecting').ProspectWorkspace;
 await ensureMonitor(pg);await pg.transaction(tx=>syncLiveInvitations(tx,w));const view=await monitoringSnapshot('live');assert.equal(view.invitations.find(i=>i.id==='legacy-checked')?.status,'checked/pending');assert.equal(view.invitations.find(i=>i.id==='legacy-auto')?.statusAt,null);assert.ok(view.invitations.every(i=>i.migrated));
 }finally{await pg.close();delete (globalThis as {evoxDB?:unknown}).evoxDB;await rm(directory,{recursive:true,force:true});}
});
