import {randomUUID,createHash} from 'node:crypto';
import {z} from 'zod';
import {db,serial} from '../demo-db';
import {qualifyReport} from '../market-research';
import {researchWorkspaceLocked} from './research-store';
import {publicCustomerProposals} from '../public-customer-proposals';
import {outreachState,outreachContactKey,outreachContact,outreachRoute,currentDraft,characterCount,type DraftSupport,publicURL,sourceInput,referenceInputSchema,entityKey,industryKey,relevantRole,idleLookup,contactGate,industryGate,referenceForDraft,invalidateProspect,validateReferenceApproval,ProspectRuleError,type ProspectWorkspace,type SelectedProspect,type CustomerReference,type ReferenceInput,type LookupState} from '../prospecting';
import {discoverPublicContacts} from './contact-discovery';
import {retrieveCustomerReferences} from './customer-references';
import {validateGenerated,generateApprovedDraft,safeError,type ApprovedDraftInput} from './openai';
const reviewer=z.string().trim().min(2).max(120),note=z.string().trim().min(10).max(1500),id=z.string().min(1).max(200),version=z.number().int().positive();
export const prospectActionSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('select'),version,reportId:id,companyId:id,researchVersion:version}).strict(),
 z.object({action:z.literal('discover'),version,companyId:id}).strict(),
 z.object({action:z.literal('manual-contact'),version,companyId:id,name:z.string().trim().min(1).max(200),title:z.string().trim().min(1).max(200),entity:z.string().trim().min(1).max(200),profileUrl:publicURL.nullable(),source:sourceInput}).strict(),
 z.object({action:z.literal('confirm-contact'),version,companyId:id,contactId:id,reviewer,note,currentRoleConfirmed:z.literal(true),entityConfirmed:z.literal(true)}).strict(),
 z.object({action:z.literal('verify-company-page'),version,companyId:id,url:publicURL,source:sourceInput,reviewer,note,confirmed:z.literal(true)}).strict(),
 z.object({action:z.literal('confirm-industry'),version,companyId:id,industry:z.string().min(1).max(200),reviewer,note,confirmed:z.literal(true)}).strict(),
 z.object({action:z.literal('save-reference'),version,referenceId:id.optional(),reference:referenceInputSchema}).strict(),
 z.object({action:z.literal('review-reference'),version,companyId:id,referenceId:id,status:z.enum(['approved','rejected']),reviewer,note,supportConfirmed:z.literal(true),scopeConfirmed:z.literal(true)}).strict(),
 z.object({action:z.literal('reference-decision'),version,companyId:id,referenceId:id.nullable(),reviewer,note,confirmed:z.literal(true)}).strict(),
 z.object({action:z.literal('refresh-references'),version}).strict(),
 z.object({action:z.literal('generate'),version,companyId:id,warm:z.boolean().optional()}).strict(),
 z.object({action:z.literal('outreach-settings'),version,companyId:id,connectionLimit:z.number().int().min(50).max(1000)}).strict(),
 z.object({action:z.literal('outreach-status'),version,companyId:id,status:z.enum(['new','accepted','checked/pending','declined','wrong contact']),reviewer,note,confirmed:z.literal(true)}).strict(),
 z.object({action:z.literal('relationship'),version,companyId:id,text:z.string().trim().min(10).max(2000),occurredOn:z.iso.date(),reviewer,note,confirmed:z.literal(true)}).strict(),
 z.object({action:z.literal('clear-relationship'),version,companyId:id,reviewer,note}).strict(),
 z.object({action:z.literal('edit-draft'),version,companyId:id,draftId:id,text:z.string().trim().min(1).max(5000)}).strict(),
 z.object({action:z.literal('copy-draft'),version,companyId:id,draftId:id}).strict(),
 z.object({action:z.literal('approve-draft'),version,companyId:id,draftId:id,reviewer,note,supportConfirmed:z.literal(true)}).strict(),
 z.object({action:z.literal('record-send'),version,companyId:id,draftId:id,reviewer,sentAt:z.iso.datetime({offset:true}),confirmed:z.literal(true)}).strict(),
]);
export type ProspectAction=z.infer<typeof prospectActionSchema>;
const globals=globalThis as unknown as {evoxProspectRuns?:Set<string>};const running=globals.evoxProspectRuns??=new Set();
function proposed(input:ReferenceInput,origin:CustomerReference['origin'],idValue:string=randomUUID(),publicationDate:string|null=null,retrievedAt=new Date().toISOString()):CustomerReference{return {...input,id:idValue,version:1,status:'proposed',approver:null,approvedAt:null,reviewNote:'',origin,retrievedAt,publicationDate,materialHash:input.materialName?createHash('sha256').update(input.excerpt).digest('hex'):null};}
async function load():Promise<ProspectWorkspace>{const pg=await db();await pg.exec('CREATE TABLE IF NOT EXISTS prospecting_workspaces(id text PRIMARY KEY,data jsonb NOT NULL)');const result=await pg.query<{data:ProspectWorkspace}>('SELECT data FROM prospecting_workspaces WHERE id=$1',['live-prospecting']);const stored=result.rows[0]?.data;if(stored){for(const c of stored.companies){outreachState(c);for(const d of c.drafts)if(!d.channel)d.invalidated=true;}return stored;}return {version:1,companies:[],references:publicCustomerProposals.map(({id,publicationDate,...r})=>proposed(r,'website',id,publicationDate,'2026-10-23')),referenceHistory:[],importStatus:idleLookup(),events:[]};}
async function save(w:ProspectWorkspace){const pg=await db();await pg.query('INSERT INTO prospecting_workspaces(id,data) VALUES($1,$2) ON CONFLICT(id) DO UPDATE SET data=excluded.data',['live-prospecting',JSON.stringify(w)]);}
function event(w:ProspectWorkspace,action:string,companyId:string|null,detail:string){w.events.push({at:new Date().toISOString(),actor:'BDR',action,companyId,detail});}
function requireRule(condition:unknown,message:string,status=422):asserts condition{if(!condition)throw new ProspectRuleError('gate_blocked',message,status);}
function revision(w:ProspectWorkspace,v:number){requireRule(w.version===v,'Prospecting workspace changed. Refresh and retry.',409);}
function selected(w:ProspectWorkspace,idValue:string){const c=w.companies.find(c=>c.id===idValue);requireRule(c,'Select the live company as BDR before contact discovery.',409);return c;}
function idle(c:SelectedProspect){requireRule(c.discovery.status!=='running'&&c.generation.status!=='running','A request for this company is already running. Wait for completion.',409);}
async function qualification(c:SelectedProspect){
 const research=await researchWorkspaceLocked();const report=[research.report,...(research.reportHistory??[])].find(r=>r?.id===c.reportId);requireRule(report,'Original company evidence is unavailable. Re-select from current research.',409);
 if(research.report&&research.report.id!==report.id){const latest=qualifyReport(research.report,research.profile);const match=[...latest.eligible,...latest.needsVerification,...latest.ineligible,...latest.excluded].find(candidate=>candidate.records.some(record=>[record.name,...record.aliases].some(name=>[c.name,...c.aliases].some(n=>entityKey(n)===entityKey(name))))&&(!candidate.country||candidate.country===c.country));
  if(match){requireRule(match.status==='Eligible','Newer research no longer qualifies this company. Resolve its current evidence before continuing.',409);requireRule(industryKey(match.industry!)===industryKey(c.qualifiedIndustry),'Newer research changed the industry. Re-select and confirm the current company scope.',409);return match;}}
 const q=qualifyReport(report,research.profile);const company=q.eligible.find(r=>r.id===c.companyId);requireRule(company,'Company is no longer eligible under the current profile/evidence. Resolve mandatory facts or exclusions before continuing.',409);return company;
}
async function view(w:ProspectWorkspace){const gates:Record<string,{eligible:boolean;canDraft:boolean;reason:string}>={};for(const c of w.companies){let eligible=false;try{await qualification(c);eligible=true;referenceForDraft(c,w.references);outreachRoute(c);gates[c.id]={eligible,canDraft:true,reason:'Contact, industry and reference/no-reference decisions are confirmed.'};}catch(error){gates[c.id]={eligible,canDraft:false,reason:error instanceof ProspectRuleError?error.message:'Qualification could not be checked.'};}}return {...w,gates};}
function reconcile(w:ProspectWorkspace){let changed=false;for(const job of [w.importStatus,...w.companies.flatMap(c=>[c.discovery,c.generation])])if(job.status==='running'&&(!job.token||!running.has(job.token)||Date.now()-Date.parse(job.startedAt??'')>8*60000)){job.status='failed';job.message='Request was interrupted. Retry explicitly.';job.errorCode='interrupted';job.finishedAt=new Date().toISOString();changed=true;}return changed;}
export async function prospectWorkspace(){return serial(async()=>{const w=await load();if(reconcile(w)){w.version++;await save(w);}return view(w);});}
export async function applyProspectAction(raw:unknown,role:string){requireRule(role==='BDR','BDR role required.',403);const parsed=prospectActionSchema.safeParse(raw);requireRule(parsed.success,'Prospecting input failed validation. Check required fields and confirmations.',400);const a=parsed.data;
 if(a.action==='discover')return runDiscovery(a.version,a.companyId);
 if(a.action==='refresh-references')return refreshReferences(a.version);
 if(a.action==='generate')return runDraft(a.version,a.companyId,generateApprovedDraft,a.warm??false);
 return serial(async()=>{const w=await load();reconcile(w);revision(w,a.version);
  if(a.action==='select'){
   const research=await researchWorkspaceLocked();requireRule(research.version===a.researchVersion&&research.report?.id===a.reportId,'Research changed. Refresh the shortlist before selecting.',409);
   const candidate=research.qualification?.eligible.find(c=>c.id===a.companyId);requireRule(candidate,'Only a currently eligible live company may be selected.');
   const existing=w.companies.find(c=>entityKey(c.name)===entityKey(candidate.name)&&c.country===candidate.country);
   if(existing){if(existing.reportId!==a.reportId){invalidateProspect(existing,'contact');Object.assign(existing,{reportId:a.reportId,companyId:a.companyId,name:candidate.name,country:candidate.country!,qualifiedIndustry:candidate.industry!,aliases:candidate.records.flatMap(r=>r.aliases)});w.version++;event(w,'reselect',existing.id,'New research snapshot selected; confirmations require review.');await save(w);}await qualification(existing);return {...await view(w),selectedId:existing.id};}
   const company:SelectedProspect={id:randomUUID(),reportId:a.reportId,companyId:a.companyId,name:candidate.name,aliases:candidate.records.flatMap(r=>r.aliases),country:candidate.country!,qualifiedIndustry:candidate.industry!,selectedBy:'BDR',selectedAt:new Date().toISOString(),contacts:[],companyPage:null,manualSearchTask:`Search public sources for ${candidate.name}: CFO, Head of FP&A, Finance Transformation, Controller, CIO.`,discovery:idleLookup(),contactId:null,industry:null,decision:null,drafts:[],generation:idleLookup()};w.companies.push(company);event(w,'select',company.id,JSON.stringify({reportId:a.reportId,researchCompanyId:a.companyId,name:company.name,country:company.country}));w.version++;await save(w);return {...await view(w),selectedId:company.id};
  }
  if(a.action==='save-reference'){
   requireRule(a.reference.sourceUrl||a.reference.excerpt.length>=10,'Supply a source URL or a supporting material excerpt of at least ten characters.');
   const input={...a.reference,materialName:a.reference.materialName||(!a.reference.sourceUrl?'Pasted BDR excerpt':null)};
   if(a.referenceId){const ref=w.references.find(r=>r.id===a.referenceId);requireRule(ref,'Reference not found.',404);w.referenceHistory.push(structuredClone(ref));Object.assign(ref,input,{version:ref.version+1,status:'proposed',approver:null,approvedAt:null,reviewNote:'',materialHash:input.materialName?createHash('sha256').update(input.excerpt).digest('hex'):null});for(const c of w.companies)if(c.decision?.kind==='reference'&&c.decision.referenceId===ref.id)invalidateProspect(c,'reference');}
   else w.references.push(proposed(input,'bdr-material'));event(w,a.action,null,'Reference saved as an unapproved proposal; affected decisions/drafts invalidated.');
  }else{
   const c=selected(w,a.companyId);if(!['outreach-status','relationship','clear-relationship','outreach-settings'].includes(a.action))idle(c);await qualification(c);
   if(a.action==='outreach-settings'){
    outreachState(c).connectionLimit=a.connectionLimit;for(const d of c.drafts)d.invalidated=true;
   }else if(a.action==='outreach-status'){
    const key=outreachContactKey(c),state=outreachState(c),old=outreachContact(c);
    requireRule(a.status!=='new'||(old.status==='new'&&!state.sends.some(send=>send.contactKey===key&&send.channel==='connection')),'An existing connection or invitation cannot be reset to new.');
    state.contacts[key]={...old,status:a.status,updatedAt:new Date().toISOString(),reviewer:a.reviewer,note:a.note};for(const d of c.drafts)d.invalidated=true;
    if(a.status==='wrong contact'){invalidateProspect(c,'contact');c.manualSearchTask='Wrong contact reported. Rediscover and confirm a different current contact before continuing.';}
   }else if(a.action==='relationship'||a.action==='clear-relationship'){
    const key=outreachContactKey(c),state=outreachState(c),old=outreachContact(c);
    if(a.action==='relationship')requireRule(a.occurredOn<=new Date().toISOString().slice(0,10),'Relationship event cannot be in the future.');
    state.contacts[key]={...old,history:a.action==='relationship'?{text:a.text,occurredOn:a.occurredOn,confirmedBy:a.reviewer,confirmedAt:new Date().toISOString(),note:a.note}:null};for(const d of c.drafts)d.invalidated=true;
   }else if(a.action==='edit-draft'||a.action==='approve-draft'||a.action==='record-send'||a.action==='copy-draft'){
    referenceForDraft(c,w.references);const draft=currentDraft(c,a.draftId);requireRule(!outreachState(c).sends.some(send=>send.draftId===draft.id),'This draft already has a manual send record.');
    const input=draftInput(c,w.references,draft.warm??false);validateGenerated(a.action==='edit-draft'?a.text:draft.text,input);
    if(a.action==='edit-draft'){
     draft.invalidated=true;c.drafts.push({...structuredClone(draft),id:randomUUID(),text:a.text,createdAt:new Date().toISOString(),invalidated:false,version:(draft.version??1)+1,parentId:draft.id,approvedBy:null,approvedAt:null});
    }else if(a.action==='approve-draft'){
     draft.approvedBy=a.reviewer;draft.approvedAt=new Date().toISOString();
    }else if(a.action==='copy-draft'){
     requireRule(draft.approvedBy&&draft.approvedAt,'BDR must approve the final text before copying.');return {...await view(w),copyText:draft.text};
    }else{
     requireRule(draft.approvedBy&&draft.approvedAt,'BDR must approve the final text before recording a manual send.');
     requireRule(Date.parse(a.sentAt)<=Date.now()&&Date.parse(a.sentAt)>=Date.parse(draft.approvedAt),'Actual manual send time must be after approval and no later than now.');
     const state=outreachState(c),key=outreachContactKey(c);state.sends.push({id:randomUUID(),draftId:draft.id,contactKey:key,channel:draft.channel!,text:draft.text,sentAt:a.sentAt,recordedAt:new Date().toISOString(),recordedBy:a.reviewer});
     if(draft.channel==='connection')state.contacts[key]={...outreachContact(c),status:'checked/pending',updatedAt:new Date().toISOString(),reviewer:a.reviewer,note:'Manual invitation send recorded; pending response.'};for(const d of c.drafts)d.invalidated=true;
    }
   }else if(a.action==='manual-contact'){
    requireRule(relevantRole(a.title),'Use a CFO, FP&A, Finance Transformation, Controller or CIO role.');const time=new Date().toISOString();
    requireRule(!a.source.publicationDate||a.source.publicationDate<=time.slice(0,10),'Contact source date cannot be in the future.');
    const flags=[...((/\bformer\b|\bex-/i.test(a.title)||a.source.publicationDate&&Date.parse(time)-Date.parse(a.source.publicationDate)>365*86400000)?['Potentially outdated role']:[]),...(![c.name,...c.aliases].some(n=>entityKey(n)===entityKey(a.entity))?['Company entity differs; verify parent/subsidiary scope']:[]),...(!a.source.publicationDate?['Undated source: verify current role']:[])];
    c.contacts.push({id:randomUUID(),name:a.name,title:a.title,entity:a.entity,profileUrl:a.profileUrl,source:{...a.source,checkedAt:time},checkedAt:time,status:'unverified',flags,confirmedBy:null,confirmedAt:null,reviewNote:''});invalidateProspect(c,'contact');
   }else if(a.action==='confirm-contact'){
    const contact=c.contacts.find(contact=>contact.id===a.contactId);requireRule(contact,'Contact candidate not found.');requireRule(relevantRole(contact.title),'Contact role is outside the requested finance/IT roles.');requireRule(!/\bformer\b|\bex-/i.test(contact.title),'A former-role candidate needs a current-role source and corrected manual entry.');
    requireRule([c.name,...c.aliases].some(n=>entityKey(n)===entityKey(contact.entity)),'Candidate company entity differs. Enter a correctly scoped contact manually before confirmation.');
    requireRule(!contact.flags.length||a.note.length>=20,'Explain how ambiguous/outdated identity or role evidence was resolved.');invalidateProspect(c,'contact');contact.status='verified';contact.confirmedBy=a.reviewer;contact.confirmedAt=new Date().toISOString();contact.reviewNote=a.note;c.contactId=contact.id;
   }else if(a.action==='verify-company-page'){
    const url=new URL(a.url);requireRule(/(^|\.)linkedin\.com$/.test(url.hostname)&&/^\/company\/[^/]+/.test(url.pathname),'Use an actual LinkedIn company page, not a person/search URL.');
    c.companyPage={url:a.url,source:{...a.source,checkedAt:new Date().toISOString()},status:'verified',confirmedBy:a.reviewer,confirmedAt:new Date().toISOString()};
   }else if(a.action==='confirm-industry'){
    contactGate(c);requireRule(industryKey(a.industry)===industryKey(c.qualifiedIndustry),'Industry differs from qualified evidence. Resolve the research industry before confirming.');invalidateProspect(c,'industry');c.industry={value:a.industry,confirmedBy:a.reviewer,confirmedAt:new Date().toISOString(),note:a.note};
   }else if(a.action==='review-reference'){
    industryGate(c);const ref=w.references.find(r=>r.id===a.referenceId);requireRule(ref,'Reference not found.');
    if(a.status==='approved'){validateReferenceApproval(ref);requireRule(industryKey(ref.industry)===industryKey(c.industry!.value),'Reference must match the confirmed industry.');}
    w.referenceHistory.push(structuredClone(ref));ref.status=a.status;ref.approver=a.reviewer;ref.approvedAt=new Date().toISOString();ref.reviewNote=a.note;
    for(const other of w.companies)if(other.decision?.kind==='reference'&&other.decision.referenceId===ref.id)invalidateProspect(other,'reference');
   }else if(a.action==='reference-decision'){
    industryGate(c);invalidateProspect(c,'reference');const now=new Date().toISOString();
    if(a.referenceId){const ref=w.references.find(r=>r.id===a.referenceId);requireRule(ref&&ref.status==='approved'&&!ref.logoOnly,'Choose an approved detailed reference or explicitly choose no customer reference.');requireRule(industryKey(ref.industry)===industryKey(c.industry!.value),'Reference does not match the confirmed industry.');c.decision={kind:'reference',referenceId:ref.id,referenceVersion:ref.version,confirmedBy:a.reviewer,confirmedAt:now,note:a.note};}
    else c.decision={kind:'no-reference',confirmedBy:a.reviewer,confirmedAt:now,note:a.note};
   }
   event(w,a.action,c.id,'reviewer' in a?JSON.stringify({reviewer:a.reviewer,note:'note' in a?a.note:null,contactId:'contactId' in a?a.contactId:null,industry:'industry' in a?a.industry:null,referenceId:'referenceId' in a?a.referenceId:null,status:'status' in a?a.status:null,draftId:'draftId' in a?a.draftId:null,relationship:'text' in a&&a.action==='relationship'?{text:a.text,occurredOn:a.occurredOn}:null}):'BDR input saved; dependent approvals/drafts invalidated.');
  }
  w.version++;await save(w);return view(w);
 });
}
function begin(job:LookupState,message:string){const token=randomUUID();running.add(token);Object.assign(job,{status:'running',message,token,startedAt:new Date().toISOString(),finishedAt:null,errorCode:null,requestId:null});return token;}
function failed(job:LookupState,error:unknown){const safe=error instanceof ProspectRuleError?{code:error.code,message:error.message,requestId:null}:safeError(error);Object.assign(job,{status:'failed',message:safe.message,errorCode:'providerCode' in safe?safe.providerCode??safe.code:safe.code,requestId:safe.requestId,finishedAt:new Date().toISOString()});}
export async function runDiscovery(versionValue:number,companyId:string,execute:typeof discoverPublicContacts=discoverPublicContacts){
 const start=await serial(async()=>{const w=await load();reconcile(w);revision(w,versionValue);const c=selected(w,companyId);idle(c);await qualification(c);const token=begin(c.discovery,'Searching public executive/team/profile sources…');w.version++;await save(w);return {token,input:{name:c.name,country:c.country,aliases:c.aliases}};});
 try{const result=await execute(start.input);return await serial(async()=>{const w=await load();const c=selected(w,companyId);requireRule(c.discovery.token===start.token&&c.discovery.status==='running','Discovery changed while searching.',409);await qualification(c);c.contacts.push(...result.contacts);invalidateProspect(c,'contact');if(result.companyPage&&c.companyPage?.status!=='verified')c.companyPage=result.companyPage;c.manualSearchTask=result.manualSearchTask;Object.assign(c.discovery,{status:'completed',message:`Found ${result.contacts.length} public contact candidates; BDR verification required.`,finishedAt:new Date().toISOString()});event(w,'discover',c.id,'Public-source candidates saved unverified.');w.version++;await save(w);return view(w);});}
 catch(error){return await serial(async()=>{const w=await load();const c=selected(w,companyId);failed(c.discovery,error);event(w,'discover-failed',c.id,'Live discovery failed explicitly. Prior contacts were preserved.');w.version++;await save(w);return view(w);});}finally{running.delete(start.token);}
}
export async function refreshReferences(versionValue:number,execute:typeof retrieveCustomerReferences=retrieveCustomerReferences){
 const token=await serial(async()=>{const w=await load();reconcile(w);revision(w,versionValue);requireRule(w.importStatus.status!=='running','Reference retrieval is already running.',409);const token=begin(w.importStatus,'Retrieving proposed customer stories from EVOX…');w.version++;await save(w);return token;});
 try{const proposals=await execute();return await serial(async()=>{const w=await load();requireRule(w.importStatus.token===token,'Reference import changed.',409);let count=0;for(const input of proposals){if(!w.references.some(r=>r.sourceUrl===input.sourceUrl&&r.customerEntity===input.customerEntity&&r.permittedClaim===input.permittedClaim)){const {publicationDate,...fields}=input;w.references.push(proposed(fields,'website',randomUUID(),publicationDate));count++;}}Object.assign(w.importStatus,{status:'completed',message:`${count} new unapproved customer-story proposals added.`,finishedAt:new Date().toISOString()});w.version++;event(w,'refresh-references',null,'Website proposals retrieved, never auto-approved.');await save(w);return view(w);});}
 catch(error){return await serial(async()=>{const w=await load();failed(w.importStatus,error);w.version++;await save(w);return view(w);});}finally{running.delete(token);}
}
export async function runDraft(versionValue:number,companyId:string,execute:typeof generateApprovedDraft=generateApprovedDraft,warm=false){
 const start=await serial(async()=>{const w=await load();reconcile(w);revision(w,versionValue);const c=selected(w,companyId);idle(c);await qualification(c);const ref=referenceForDraft(c,w.references);const input=draftInput(c,w.references,warm);const support=draftSupport(c,w.references,warm);const token=begin(c.generation,'Generating from BDR-confirmed inputs…');w.version++;await save(w);return {input,support,contactKey:outreachContactKey(c),token,version:w.version,referenceId:ref?.id??null,referenceVersion:ref?.version??null};});
 try{const result=await execute(start.input);return await serial(async()=>{const w=await load();requireRule(w.version===start.version,'Inputs changed during generation. No draft saved.',409);const c=selected(w,companyId);await qualification(c);referenceForDraft(c,w.references);outreachRoute(c);validateGenerated(result.text,start.input);requireRule(c.generation.token===start.token,'Generation request changed.',409);c.drafts.push({id:randomUUID(),text:result.text,model:result.model,responseId:result.responseId,createdAt:result.generatedAt,invalidated:false,contactKey:start.contactKey,channel:start.input.channel,warm,version:(c.drafts.at(-1)?.version??0)+1,parentId:c.drafts.at(-1)?.id??null,characterLimit:start.input.characterLimit,support:start.support,approvedBy:null,approvedAt:null,referenceId:start.referenceId,referenceVersion:start.referenceVersion});Object.assign(c.generation,{status:'completed',message:'Draft saved for BDR review; no message was sent.',finishedAt:new Date().toISOString()});w.version++;event(w,'generate',c.id,'Draft generated behind confirmed contact/industry/reference gates.');await save(w);return view(w);});}
 catch(error){return await serial(async()=>{const w=await load();const c=selected(w,companyId);failed(c.generation,error);w.version++;await save(w);return view(w);});}finally{running.delete(start.token);}
}

function draftInput(c:SelectedProspect,refs:CustomerReference[],warm:boolean):ApprovedDraftInput{
 const ref=referenceForDraft(c,refs),contact=contactGate(c),channel=outreachRoute(c),history=outreachContact(c).history;
 requireRule(!warm||history,'Warm reconnection requires BDR-supplied and confirmed relationship history.');
 return {channel,contactName:contact.name,contactRole:contact.title,company:c.name,industry:c.industry!.value,approvedClaim:ref?.permittedClaim??null,entity:ref?.customerEntity??null,characterLimit:channel==='connection'?outreachState(c).connectionLimit:5000,demo:false,geographicScope:ref?.geographicScope??null,customerApplication:ref?.application??null,relationshipHistory:warm&&history?`${history.occurredOn}: ${history.text}`:null,warm};
}
function draftSupport(c:SelectedProspect,refs:CustomerReference[],warm:boolean):DraftSupport[]{
 const contact=contactGate(c),ref=referenceForDraft(c,refs),history=outreachContact(c).history;
 const support:DraftSupport[]=[{label:'Confirmed contact and role',claim:`${contact.name}, ${contact.title}, ${contact.entity}`,sourceUrl:contact.source.url,approvedBy:contact.confirmedBy!,approvedAt:contact.confirmedAt!},{label:'Confirmed industry',claim:c.industry!.value,sourceUrl:null,approvedBy:c.industry!.confirmedBy,approvedAt:c.industry!.confirmedAt}];
 if(ref)support.push({label:`Customer evidence revision ${ref.version}: ${ref.customerEntity}; ${ref.application}; ${ref.geographicScope}`,claim:ref.permittedClaim,sourceUrl:ref.sourceUrl,approvedBy:ref.approver!,approvedAt:ref.approvedAt!});
 else support.push({label:'No customer reference',claim:'No customer implementation or performance claims permitted.',sourceUrl:null,approvedBy:c.decision!.confirmedBy,approvedAt:c.decision!.confirmedAt});
 if(warm&&history)support.push({label:'BDR relationship history',claim:`${history.occurredOn}: ${history.text}`,sourceUrl:null,approvedBy:history.confirmedBy,approvedAt:history.confirmedAt});return support;
}
