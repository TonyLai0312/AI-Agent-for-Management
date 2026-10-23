import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {fixtureEligible,referenceIndustries} from './demo-ranking';
import {dueAt} from './workflow';
import type {DemoState,Role,Company,Channel,Approval} from './demo-types';
export class RuleError extends Error {constructor(message:string,public status=422){super(message)}}
const isoDate=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v,'Invalid calendar date');
const list=(v:string)=>v.split(',').map(x=>x.trim().toLowerCase()).filter(Boolean);
export const profileSchema=z.object({countries:z.string().min(1).max(1000),industries:z.string().min(1).max(1000),employees:z.number().int().nonnegative(),revenue:z.number().nonnegative(),technologies:z.string().max(1000),exclusions:z.string().max(1000),start:isoDate,end:isoDate,limit:z.number().int().min(50).max(2000),holidays:z.string().max(2000)}).refine(p=>p.start<=p.end,'Research start must not exceed end').refine(p=>p.holidays.split(',').every(d=>!d.trim()||isoDate.safeParse(d.trim()).success),'Use valid ISO holiday dates');
export const actionSchema=z.object({action:z.enum(['profile','select','contact','industry','approve-contact','verify-email','approve-industry','edit-evidence','approve-evidence','generate','edit-draft','approve-draft','send','status','check-alerts','clock','reset']),version:z.number().int().positive(),companyId:z.string().optional(),profile:profileSchema.optional(),selected:z.boolean().optional(),name:z.string().max(150).optional(),title:z.string().max(150).optional(),source:z.string().max(1000).optional(),email:z.string().max(250).optional(),emailVerified:z.boolean().optional(),industry:z.string().max(150).optional(),reason:z.string().max(1000).optional(),evidenceId:z.string().nullable().optional(),passage:z.string().max(3000).optional(),claim:z.string().max(500).optional(),entity:z.string().max(200).optional(),draftId:z.string().optional(),text:z.string().max(5000).optional(),sentAt:z.string().optional(),sendId:z.string().optional(),status:z.enum(['accepted','checked/pending','declined','wrong contact']).optional(),clock:z.string().optional(),confirmation:z.string().optional()});
export type Action=z.infer<typeof actionSchema>;
function requireRule(condition:unknown,message:string):asserts condition {if(!condition)throw new RuleError(message)}
function auth(role:Role,needed:Role){if(role!==needed)throw new RuleError(`${needed} role required`,403)}
function approval(s:DemoState,c:Company,kind:Approval['kind']){return s.approvals.find(a=>a.companyId===c.id&&a.kind===kind&&a.active)}
export function eligible(s:DemoState,c:Company){return fixtureEligible(c,s.campaign.profile)}
export function latestSend(s:DemoState,c:Company){return s.sends.filter(x=>x.companyId===c.id&&x.contactId===c.contactId&&x.channel==='connection').sort((a,b)=>b.recordedAt.localeCompare(a.recordedAt))[0]}
export function nextChannel(s:DemoState,c:Company):Channel|null {const sent=latestSend(s,c);if(!sent)return 'connection';return sent.status==='accepted'?'linkedin':sent.status==='checked/pending'?'email':null}
function invalidate(s:DemoState,c:Company,kinds:Approval['kind'][]){for(const a of s.approvals)if(a.companyId===c.id&&kinds.includes(a.kind))a.active=false;for(const d of s.drafts)if(d.companyId===c.id){d.invalidated=true;d.approved=false;d.approvalAt=null}}
function approve(s:DemoState,c:Company,kind:Approval['kind'],note:string,evidenceId:string|null=null){for(const a of s.approvals)if(a.companyId===c.id&&a.kind===kind)a.active=false;const e=s.evidence.find(e=>e.id===evidenceId);s.approvals.push({id:randomUUID(),companyId:c.id,kind,active:true,evidenceId,evidenceVersion:e?.version??null,at:s.campaign.clock,actor:'BDR',note})}
function gates(s:DemoState,c:Company){requireRule(c.selected,'Select the company first');requireRule(eligible(s,c),'Company no longer meets the current target profile');requireRule(approval(s,c,'contact')&&approval(s,c,'industry'),'Confirm contact and industry before continuing');const a=approval(s,c,'evidence');requireRule(a,'Approve customer evidence or explicitly choose no customer claim');if(a.evidenceId){const e=s.evidence.find(x=>x.id===a.evidenceId);requireRule(e&&!e.logoOnly&&e.version===a.evidenceVersion,'Evidence approval is stale or unsupported')}return a}
function validDraft(s:DemoState,d:DemoState['drafts'][number]){requireRule(d.text.trim(),'Draft cannot be empty');if(d.channel==='connection')requireRule(Array.from(d.text).length<=s.campaign.profile.limit,`Draft exceeds ${s.campaign.profile.limit} characters`);requireRule(!d.invalidated,'Draft is invalidated; regenerate after reapproval');for(const id of d.context)requireRule(s.approvals.some(a=>a.id===id&&a.active),'Draft approval context is stale')}
export function applyAction(s:DemoState,a:Action,role:Role){
 if(a.version!==s.campaign.version)throw new RuleError('Workspace changed. Refresh and retry.',409);
 const now=s.campaign.clock;
 if(['profile','clock','check-alerts','reset'].includes(a.action))auth(role,'GM');else auth(role,'BDR');
 if(a.action==='profile'){requireRule(a.profile,'Profile is required');s.events.push({id:randomUUID(),at:now,actor:role,action:'profile-snapshot',companyId:null,detail:JSON.stringify(s.campaign.profile)});s.campaign.profile=a.profile;for(const d of s.drafts)if(!s.sends.some(x=>x.draftId===d.id)){d.approved=false;d.approvalAt=null}}
 else if(a.action==='clock'){requireRule(a.clock&&Number.isFinite(Date.parse(a.clock)),'Valid demo clock is required');requireRule(Date.parse(a.clock)>=Date.parse(now),'Demo clock cannot go backward; use reset');s.campaign.clock=new Date(a.clock).toISOString()}
 else if(a.action==='check-alerts'){
  for(const sent of s.sends){if(sent.channel!=='connection'||sent.updatedAt||!sent.dueAt||Date.parse(now)<Date.parse(sent.dueAt)||s.alerts.some(x=>x.sendId===sent.id))continue;
   const contact=s.contacts.find(c=>c.id===sent.contactId)!;
   s.alerts.push({id:randomUUID(),companyId:sent.companyId,sendId:sent.id,createdAt:now,resolvedAt:null,delivery:'demo-recorded',owner:'Demo BDR',contact:contact.name,deadline:sent.dueAt,recordUrl:`/?screen=5&company=${sent.companyId}`});
  }
 }
 else {
  const c=s.companies.find(c=>c.id===a.companyId);requireRule(c,'Company not found');
  if(a.action==='select'){requireRule(typeof a.selected==='boolean','Selection required');if(a.selected)requireRule(eligible(s,c),'Only eligible companies can be selected');else requireRule(!s.sends.some(x=>x.companyId===c.id),'Cannot deselect a company with outreach history');c.selected=a.selected;c.decision=a.reason||'BDR selection';if(!a.selected)invalidate(s,c,['contact','industry','evidence'])}
  else {requireRule(c.selected,'Select the company first');
   if(a.action==='contact'){
    const prior=latestSend(s,c);requireRule(!prior||prior.status==='wrong contact','Current outreach exists; use wrong contact routing before replacing identity');
    requireRule(a.name?.trim()&&a.title?.trim()&&a.source?.trim(),'Name, finance/IT title and public source are required');requireRule(/finance|financial|fp&a|cfo|cio|controller|\bit\b/i.test(a.title!),'Use a relevant finance or IT role');
    let url:URL;try{url=new URL(a.source!)}catch{throw new RuleError('Valid HTTPS source URL required')}requireRule(url.protocol==='https:','Source must use HTTPS');
    if(a.emailVerified)requireRule(a.email&&z.email().safeParse(a.email).success,'Valid verified email required');
    const id=randomUUID();s.contacts.push({id,companyId:c.id,name:a.name!.trim(),title:a.title!,entity:c.name,source:a.source!,checkedAt:now,verified:true,email:a.email||'',emailVerified:!!a.emailVerified});c.contactId=id;invalidate(s,c,['contact','industry','evidence']);
   }
   else if(a.action==='industry'){requireRule(a.industry?.trim(),'Industry required');if(c.industryOptions.length>1)requireRule(a.reason?.trim(),'Explain how conflicting evidence was resolved');c.industry=a.industry!;c.industryReason=a.reason||'BDR correction';invalidate(s,c,['industry','evidence'])}
   else if(a.action==='verify-email'){const contact=s.contacts.find(x=>x.id===c.contactId);requireRule(contact&&a.email&&z.email().safeParse(a.email).success,'Valid email required');requireRule(a.emailVerified===true,'Explicit email verification required');contact.email=a.email;contact.emailVerified=true;}
   else if(a.action==='approve-contact'){const contact=s.contacts.find(x=>x.id===c.contactId);requireRule(contact?.verified,'No verified contact. Complete the unresolved manual-search task');approve(s,c,'contact',`Verified demo contact ${contact.name}, ${contact.title}, source ${contact.source}`)}
   else if(a.action==='approve-industry'){requireRule(c.industryOptions.length===1||c.industryReason.trim(),'Resolve conflicting industry evidence with a reason first');requireRule(eligible(s,c),'Confirmed industry must meet target criteria');approve(s,c,'industry',`${c.industry}: ${c.industryReason||'Fixture industry confirmed'}`)}
   else if(a.action==='edit-evidence'){
    const e=s.evidence.find(x=>x.id===a.evidenceId&&x.companyId===c.id);requireRule(e,'Evidence not found');requireRule(!e.logoOnly,'A logo cannot be converted into a detailed claim without a supporting story');requireRule(a.passage?.trim()&&a.claim?.trim()&&a.entity?.trim(),'Source passage, entity and permitted claim are required');
    s.events.push({id:randomUUID(),at:now,actor:role,action:'evidence-snapshot',companyId:c.id,detail:JSON.stringify(e)});e.passage=a.passage!;e.claim=a.claim!;e.entity=a.entity!;e.version++;invalidate(s,c,['evidence']);
   }
   else if(a.action==='approve-evidence'){
    requireRule(approval(s,c,'contact')&&approval(s,c,'industry'),'Confirm contact and industry before evidence approval');requireRule(a.evidenceId!==undefined,'Choose a reference or explicitly choose no claim');
    if(a.evidenceId){const e=s.evidence.find(x=>x.id===a.evidenceId&&x.companyId===c.id);requireRule(e&&!e.logoOnly&&e.claim.trim()&&e.passage.trim(),'Logo-only evidence cannot support a customer claim');requireRule(referenceIndustries[e.id]?.includes(c.industry),'Customer reference does not match the confirmed industry')}
    invalidate(s,c,['evidence']);approve(s,c,'evidence',a.evidenceId?'Approved exact passage, entity scope and permitted claim':'Approved no-customer-claim path',a.evidenceId);
   }
   else if(a.action==='generate'){
    const evidenceApproval=gates(s,c),channel=nextChannel(s,c);requireRule(channel,'No next draft: awaiting update, declined, or contact discovery required');
    const contact=s.contacts.find(x=>x.id===c.contactId)!;const e=s.evidence.find(x=>x.id===evidenceApproval.evidenceId);const claim=e?`${e.claim} `:'';
    const text=channel==='connection'?`Hi ${contact.name}, I’m with EVOX. ${claim}Would you be open to connecting to exchange FP&A perspectives?`:channel==='linkedin'?`Hi ${contact.name}, thanks for connecting. ${claim}Which planning and forecasting priorities matter most to your team this year?`:`Subject: FP&A priorities at ${c.name}\n\nHi ${contact.name},\n${claim}Would a brief conversation about your team’s planning priorities be useful?\n\nEVOX`;
    const version=1+Math.max(0,...s.drafts.filter(d=>d.companyId===c.id).map(d=>d.version));s.drafts.push({id:randomUUID(),companyId:c.id,contactId:contact.id,channel,text,version,approved:false,invalidated:false,at:now,approvalAt:null,context:s.approvals.filter(x=>x.companyId===c.id&&x.active).map(x=>x.id),evidenceId:e?.id??null,evidenceVersion:e?.version??null});
   }
   else if(a.action==='edit-draft'||a.action==='approve-draft'||a.action==='send'){
    gates(s,c);const d=s.drafts.find(x=>x.id===a.draftId&&x.companyId===c.id);requireRule(d,'Draft not found');requireRule(d.contactId===c.contactId&&d.channel===nextChannel(s,c),'Draft no longer matches the current contact or route');requireRule(!s.sends.some(x=>x.draftId===d.id),'Draft already sent');
    requireRule(d.version===Math.max(...s.drafts.filter(x=>x.companyId===c.id).map(x=>x.version)),'A newer draft exists');
    if(a.action==='edit-draft'){requireRule(a.text?.trim(),'Draft cannot be empty');requireRule(!d.invalidated,'Draft is invalidated; regenerate after reapproval');for(const id of d.context)requireRule(s.approvals.some(x=>x.id===id&&x.active),'Draft approval context is stale');s.drafts.push({...d,id:randomUUID(),text:a.text!,version:d.version+1,approved:false,approvalAt:null,at:now})}
    else if(a.action==='approve-draft'){validDraft(s,d);d.approved=true;d.approvalAt=now}
    else {validDraft(s,d);requireRule(d.approved,'Approve the draft before recording send');requireRule(a.sentAt&&Number.isFinite(Date.parse(a.sentAt)),'Actual send time is required');requireRule(Date.parse(a.sentAt)<=Date.parse(now),'Send time cannot be after the demo clock');
     const previous=latestSend(s,c);if(d.channel!=='connection')requireRule(previous&&Date.parse(a.sentAt)>=Date.parse(previous.sentAt),'Follow-up cannot precede the invitation');
     if(d.channel==='email'){const contact=s.contacts.find(x=>x.id===c.contactId)!;requireRule(contact.emailVerified&&z.email().safeParse(contact.email).success,'Verify the recipient email before recording email outreach')}
     s.sends.push({id:randomUUID(),companyId:c.id,contactId:c.contactId!,draftId:d.id,channel:d.channel,text:d.text,sentAt:new Date(a.sentAt).toISOString(),recordedAt:now,dueAt:d.channel==='connection'?dueAt(a.sentAt,s.campaign.profile.holidays.split(',').map(x=>x.trim())):null,status:null,updatedAt:null});
    }
   }
   else if(a.action==='status'){
    const sent=s.sends.find(x=>x.id===a.sendId&&x.companyId===c.id&&x.channel==='connection');requireRule(sent&&a.status,'Connection send record and status required');requireRule(latestSend(s,c)?.id===sent.id,'Update the current contact’s invitation');requireRule(Date.parse(now)>=Date.parse(sent.sentAt),'Update cannot precede send');
    sent.status=a.status;sent.updatedAt=now;s.updates.push({id:randomUUID(),companyId:c.id,sendId:sent.id,status:a.status,at:now});for(const alert of s.alerts)if(alert.sendId===sent.id)alert.resolvedAt=now;
    for(const d of s.drafts)if(d.companyId===c.id&&!s.sends.some(x=>x.draftId===d.id)){d.invalidated=true;d.approved=false;d.approvalAt=null}
    if(a.status==='wrong contact')invalidate(s,c,['contact','industry','evidence']);
   }
  }
 }
 s.campaign.version++;s.events.push({id:randomUUID(),at:s.campaign.clock,actor:role,action:a.action,companyId:a.companyId??null,detail:a.action==='status'?`Status: ${a.status}`:a.action==='check-alerts'?'Demo alert check; no email sent':`${a.action} completed`});return s;
}
