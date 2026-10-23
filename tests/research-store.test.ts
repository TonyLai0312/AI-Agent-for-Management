import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {db,load,resetDemo} from '../lib/demo-db';
import {initialResearchProfile,type ResearchReport,type Source} from '../lib/market-research';
import {researchWorkspace,startResearch,updateResearchProfile,reviewResearchEvidence} from '../lib/server/research-store';
import {OpenAIIntegrationError} from '../lib/server/openai';
import type {runMarketResearch} from '../lib/server/market-research';
import {randomUUID} from 'node:crypto';
test('research progress, failures, retry snapshots and reviews persist independently of demo reset',async()=>{
 await mkdir('work',{recursive:true});const directory=await mkdtemp(path.resolve('work/research-db-'));process.env.EVOX_DB_PATH=path.join(directory,'pg');
 const globals=globalThis as unknown as {evoxDB?:unknown};let pg=await db();
 try{
  let workspace=await researchWorkspace();assert.equal(workspace.report,null);assert.equal(workspace.profile.minimumRevenueUSD,200000000);
  const profile={...initialResearchProfile(new Date('2026-10-23')),exclusions:['Excluded Inc']};workspace=await updateResearchProfile(profile,workspace.version);
  let unblock!:(report:ResearchReport)=>void;
  const wait=new Promise<ResearchReport>(resolve=>{unblock=resolve;});
  const fake=(async(value,progress)=>{await progress?.('searching','Searching public sources');return wait;}) as typeof runMarketResearch;
  const pending=startResearch(workspace.version,fake);
  // Wait for a persisted running phase without holding the database serial queue.
  for(let i=0;i<100;i++){workspace=await researchWorkspace();if(workspace.job?.phase==='searching')break;await new Promise(r=>setTimeout(r,5));}
  assert.equal(workspace.job?.status,'running');assert.equal(workspace.job?.phase,'searching');
  await assert.rejects(()=>startResearch(workspace.version,fake),/already running/);
  const source:Source={id:randomUUID(),url:'https://example.org/report',title:'Source',passage:'Supporting passage',publicationDate:null,retrievedAt:new Date().toISOString(),status:'unverified',reviewedAt:null,reviewedBy:null,reviewNote:''};
  const report:ResearchReport={id:randomUUID(),profile,model:'fixture-test',responseIds:['fixture'],retrievedAt:new Date().toISOString(),trends:[{claim:'Market trend only',evidence:[source]}],companies:[],limitations:['Test-only response']};
  unblock(report);workspace=await pending;assert.equal(workspace.job?.status,'completed');assert.deepEqual(workspace.report,report);
  workspace=await reviewResearchEvidence({version:workspace.version,evidenceId:source.id,status:'verified',note:'Checked exact source passage.'},'BDR');assert.equal(workspace.report?.trends[0].evidence[0].status,'verified');assert.equal(workspace.reviews.length,1);
  await assert.rejects(()=>reviewResearchEvidence({version:1,evidenceId:source.id,status:'verified',note:'Stale review'},'BDR'),/changed/);
  const failing=(async()=>{throw new OpenAIIntegrationError('authentication_failed','OpenAI rejected the configured server credential.',503);}) as typeof runMarketResearch;
  const previous=structuredClone(workspace.report);workspace=await startResearch(workspace.version,failing);assert.equal(workspace.job?.status,'failed');assert.equal(workspace.job?.error?.code,'authentication_failed');assert.deepEqual(workspace.report,previous);assert.equal(workspace.history.length,1);
  await pg.transaction(async tx=>resetDemo(tx,await load(tx)));assert.deepEqual((await researchWorkspace()).report,previous);
  await pg.close();delete globals.evoxDB;pg=await db();workspace=await researchWorkspace();assert.equal(workspace.job?.status,'failed');assert.deepEqual(workspace.report,previous);
  workspace=await startResearch(workspace.version,(async()=>report) as typeof runMarketResearch);assert.equal(workspace.job?.status,'completed');assert.equal(workspace.history.length,2);assert.equal(workspace.reportHistory?.length,1);assert.deepEqual(workspace.reportHistory?.[0],previous);
 }finally{await pg.close();delete globals.evoxDB;await rm(directory,{recursive:true,force:true});}
});
