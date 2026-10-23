import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {seedProspectBrowser} from './prospect-browser-seed';
import {monitoringSnapshot} from '../lib/server/monitor-store';
import {db} from '../lib/demo-db';
import {prospectWorkspace,applyProspectAction,runDraft} from '../lib/server/prospect-store';
import {characterCount,outreachRoute} from '../lib/prospecting';
import {validateGenerated,generateApprovedDraft,type ResponsesClient,type ApprovedDraftInput} from '../lib/server/openai';
test('outreach routes, immutable versions, approvals, evidence, history and manual sends are enforced server-side',async()=>{
 await mkdir('work',{recursive:true});const directory=await mkdtemp(path.resolve('work/outreach-test-'));process.env.EVOX_DB_PATH=path.join(directory,'pg');await seedProspectBrowser();const pg=await db();
 try{
 let w=await prospectWorkspace();w=await applyProspectAction({action:'select',version:w.version,reportId:'browser-fixture-report',companyId:'browser-fixture-company',researchVersion:1},'BDR');const companyId=w.companies[0].id;
 const run=async(action:string,data:Record<string,unknown>={})=>w=await applyProspectAction({action,version:w.version,companyId,...data},'BDR');
 const review={reviewer:'Test BDR',note:'Checked approved support and current contact status.'};
 await run('manual-contact',{name:'Alex QA',title:'CFO',entity:'Browser Fixture Foods',profileUrl:null,source:{url:'https://example.org/qa-team',title:'Explicit QA source',passage:'Alex QA is CFO of Browser Fixture Foods.',publicationDate:null}});const contactId=w.companies[0].contacts[0].id;
 const gates=async()=>{await run('confirm-contact',{contactId,...review,currentRoleConfirmed:true,entityConfirmed:true});await run('confirm-industry',{industry:'Food & Beverage Manufacturing',...review,confirmed:true});await run('reference-decision',{referenceId:null,...review,confirmed:true});};await gates();
 let calls=0,context:ApprovedDraftInput|null=null;
 const provider:typeof generateApprovedDraft=async input=>{calls++;context=input;return {text:'Hi Alex QA, open to connecting about finance planning?',model:'explicit-qa',responseId:'qa-response',generatedAt:new Date().toISOString(),promptVersion:'evox-draft-v2'};};
 await assert.rejects(()=>runDraft(w.version,companyId,provider),/check existing/);assert.equal(calls,0);
 await run('outreach-status',{status:'new',...review,confirmed:true});
 await assert.rejects(()=>runDraft(w.version,companyId,provider,true),/relationship history/);
 await run('outreach-settings',{connectionLimit:100});w=await runDraft(w.version,companyId,provider);let draft=w.companies[0].drafts.at(-1)!;assert.equal(draft.channel,'connection');assert.equal(draft.characterLimit,100);assert.ok(draft.support?.some(s=>s.label==='No customer reference'));assert.equal(draft.approvedAt,null);
 await assert.rejects(()=>run('copy-draft',{draftId:draft.id}),/approve/);
 await assert.rejects(()=>run('record-send',{draftId:draft.id,reviewer:review.reviewer,sentAt:new Date().toISOString(),confirmed:true}),/approve/);
 await assert.rejects(()=>run('edit-draft',{draftId:draft.id,text:'X'.repeat(101)}),/exceeds/);
 await run('edit-draft',{draftId:draft.id,text:'Hi Alex QA, open to connecting? 👋'});const edited=w.companies[0].drafts.at(-1)!;assert.equal(edited.version,2);assert.equal(edited.parentId,draft.id);assert.equal(w.companies[0].drafts[0].text,draft.text);assert.equal(characterCount('👋'),1);
 await assert.rejects(()=>run('approve-draft',{draftId:draft.id,...review,supportConfirmed:true}),/latest valid/);
 await run('approve-draft',{draftId:edited.id,...review,supportConfirmed:true});draft=w.companies[0].drafts.at(-1)!;assert.ok(draft.approvedAt);
 await assert.rejects(()=>run('record-send',{draftId:draft.id,reviewer:review.reviewer,sentAt:'2000-01-01T00:00:00Z',confirmed:true}),/after approval/);
 const copied=await applyProspectAction({action:'copy-draft',version:w.version,companyId,draftId:draft.id},'BDR');assert.equal('copyText' in copied?copied.copyText:null,draft.text);
 const sentAt=new Date().toISOString();await run('record-send',{draftId:draft.id,reviewer:review.reviewer,sentAt,confirmed:true});assert.equal(w.companies[0].outreach?.sends[0].sentAt,sentAt);assert.equal(outreachRoute(w.companies[0]),'email');const monitoring=await monitoringSnapshot('live');assert.equal(monitoring.invitations.length,1);assert.equal(monitoring.invitations[0].statusAt,null);assert.equal(monitoring.invitations[0].migrated,false);assert.notEqual(w.companies[0].outreach?.sends[0].recordedAt,draft.createdAt);
 await assert.rejects(()=>run('outreach-status',{status:'new',...review,confirmed:true}),/cannot be reset/);
 w=await runDraft(w.version,companyId,provider);assert.equal(w.companies[0].drafts.at(-1)?.channel,'email');assert.equal((context as unknown as ApprovedDraftInput).relationshipHistory,null);
 await run('outreach-status',{status:'checked/pending',...review,confirmed:true});assert.equal((await monitoringSnapshot('live')).invitations[0].status,'checked/pending');
 await run('outreach-status',{status:'accepted',...review,confirmed:true});assert.equal(outreachRoute(w.companies[0]),'linkedin');
 await run('relationship',{text:'Met at the regional finance workshop and discussed planning priorities.',occurredOn:'2026-01-05',...review,confirmed:true});w=await runDraft(w.version,companyId,provider,true);assert.equal((context as unknown as ApprovedDraftInput).warm,true);assert.ok((context as unknown as ApprovedDraftInput).relationshipHistory?.includes('finance workshop'));assert.ok(w.companies[0].drafts.at(-1)?.support?.some(s=>s.label==='BDR relationship history'));
 await run('clear-relationship',review);assert.ok(w.companies[0].drafts.every(d=>d.invalidated));await assert.rejects(()=>runDraft(w.version,companyId,provider,true),/history/);
 await run('outreach-status',{status:'declined',...review,confirmed:true});const before=calls;await assert.rejects(()=>runDraft(w.version,companyId,provider),/stopped/);assert.equal(calls,before);
 await run('outreach-status',{status:'accepted',...review,confirmed:true});let release!:()=>void;const wait=new Promise<void>(r=>release=r);const generating=runDraft(w.version,companyId,async input=>{await wait;return provider(input);});
 for(let n=0;n<20;n++){w=await prospectWorkspace();if(w.companies[0].generation.status==='running')break;await new Promise(r=>setTimeout(r,5));}
 await run('outreach-status',{status:'declined',...review,confirmed:true});const draftCount=w.companies[0].drafts.length;release();w=await generating;assert.equal(w.companies[0].drafts.length,draftCount);assert.equal(w.companies[0].generation.status,'failed');
 await run('outreach-status',{status:'wrong contact',...review,confirmed:true});assert.equal(w.companies[0].contactId,null);assert.match(w.companies[0].manualSearchTask,/Rediscover/);await gates();await assert.rejects(()=>runDraft(w.version,companyId,provider),/Wrong contact/);
 }finally{await pg.close();delete (globalThis as {evoxDB?:unknown}).evoxDB;await rm(directory,{recursive:true,force:true});}
});
test('overlong output is rewritten in bounded Responses calls without truncation; warm input requires history',async()=>{
 const input:ApprovedDraftInput={channel:'connection',contactName:'Alex',contactRole:'CFO',company:'QA Foods',industry:'Retail',approvedClaim:null,entity:null,characterLimit:60,demo:false};let calls=0;
 const client={responses:{create:async(body:any)=>{calls++;if(calls>1)assert.match(JSON.parse(body.input).revisionInstruction,/Rewrite complete sentences/);return {id:'qa',status:'completed',output_text:JSON.stringify({message:calls===1?'X'.repeat(100):'Hi Alex, open to connecting?'})};}}} as unknown as ResponsesClient;
 const result=await generateApprovedDraft(input,client);assert.equal(calls,2);assert.equal(result.text,'Hi Alex, open to connecting?');
 await assert.rejects(()=>generateApprovedDraft({...input,warm:true},client),/history/);
 assert.throws(()=>validateGenerated('As you mentioned, planning is difficult.',input),/relationship/);assert.throws(()=>validateGenerated('Your team uses Oracle.',input),/technology/);
 let bounded=0;const tooLong={responses:{create:async()=>{bounded++;return {id:'qa',status:'completed',output_text:JSON.stringify({message:'X'.repeat(100)})};}}} as unknown as ResponsesClient;await assert.rejects(()=>generateApprovedDraft(input,tooLong),/exceeds/);assert.equal(bounded,3);
});
