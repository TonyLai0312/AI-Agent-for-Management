import {z} from 'zod';
const short=z.string().trim().min(1).max(200);
export const publicURL=z.string().url().max(2000).refine(value=>{try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password;}catch{return false;}},'Use a public HTTPS URL without embedded credentials.');
export const sourceInput=z.object({url:publicURL,title:short,passage:z.string().trim().min(10).max(3000),publicationDate:z.iso.date().nullable()}).strict();
export type SupportingSource=z.infer<typeof sourceInput>&{checkedAt:string};
export const searchTitles=['CFO','Head of FP&A','Finance Transformation leader','Controller','CIO'];
export const relevantRole=(title:string)=>/\bcfo\b|financial|finance|fp\s*&\s*a|controller|\bcio\b|chief information/i.test(title);
export const entityKey=(name:string)=>name.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
export const industryKey=(name:string)=>{const key=entityKey(name);return /^(groceryretail|retail)$/.test(key)?'retail':/^(foodandbeveragemanufacturing|foodbeveragemanufacturing|fbmanufacturing)$/.test(key)?'foodbeverage':key;};
export type LiveContact={id:string;name:string;title:string;entity:string;profileUrl:string|null;source:SupportingSource;checkedAt:string;status:'unverified'|'verified';flags:string[];confirmedBy:string|null;confirmedAt:string|null;reviewNote:string};
export type ContactPage={url:string;source:SupportingSource;status:'unverified'|'verified';confirmedBy:string|null;confirmedAt:string|null};
export type CustomerReference={id:string;version:number;customerEntity:string;industry:string;application:string;permittedClaim:string;sourceUrl:string|null;excerpt:string;materialName:string|null;materialHash:string|null;geographicScope:string;logoOnly:boolean;status:'proposed'|'approved'|'rejected';approver:string|null;approvedAt:string|null;reviewNote:string;origin:'website'|'bdr-material';retrievedAt:string;publicationDate:string|null};
export const referenceInputSchema=z.object({customerEntity:short,industry:z.string().trim().max(200),application:z.string().trim().max(1000),permittedClaim:z.string().trim().max(1200),sourceUrl:publicURL.nullable(),excerpt:z.string().trim().max(6000),materialName:z.string().max(180).nullable(),geographicScope:z.string().trim().max(500),logoOnly:z.boolean()}).strict();
export type ReferenceInput=z.infer<typeof referenceInputSchema>;
export type GateDecision={kind:'reference';referenceId:string;referenceVersion:number;confirmedBy:string;confirmedAt:string;note:string}|{kind:'no-reference';confirmedBy:string;confirmedAt:string;note:string};
export type LookupState={status:'idle'|'running'|'completed'|'failed';message:string;startedAt:string|null;finishedAt:string|null;token:string|null;errorCode:string|null;requestId:string|null};
export const idleLookup=():LookupState=>({status:'idle',message:'Not started',startedAt:null,finishedAt:null,token:null,errorCode:null,requestId:null});
export type SelectedProspect={id:string;reportId:string;companyId:string;name:string;aliases:string[];country:string;qualifiedIndustry:string;selectedBy:'BDR';selectedAt:string;contacts:LiveContact[];companyPage:ContactPage|null;manualSearchTask:string;discovery:LookupState;contactId:string|null;industry:{value:string;confirmedBy:string;confirmedAt:string;note:string}|null;decision:GateDecision|null;drafts:LiveDraft[];generation:LookupState;outreach?:OutreachState};
export type ProspectWorkspace={version:number;companies:SelectedProspect[];references:CustomerReference[];referenceHistory:CustomerReference[];importStatus:LookupState;events:{at:string;actor:string;action:string;companyId:string|null;detail:string}[]};
export class ProspectRuleError extends Error{constructor(public code:string,message:string,public status=422){super(message);}}
const requireRule=(value:unknown,message:string)=>{if(!value)throw new ProspectRuleError('gate_blocked',message);};
export function contactGate(company:SelectedProspect){const contact=company.contacts.find(c=>c.id===company.contactId);requireRule(contact?.status==='verified','BDR must confirm a current contact before continuing.');return contact!;}
export function industryGate(company:SelectedProspect){contactGate(company);requireRule(company.industry,'BDR must confirm the industry after the contact.');return company.industry!;}
export function referenceForDraft(company:SelectedProspect,references:CustomerReference[]){
 industryGate(company);requireRule(company.decision,'Confirm an approved reference or explicitly choose no customer reference.');
 if(company.decision!.kind==='no-reference')return null;
 const decision=company.decision!;const reference=references.find(r=>r.id===decision.referenceId);
 requireRule(reference&&reference.status==='approved'&&!reference.logoOnly&&reference.version===decision.referenceVersion,'Customer evidence changed or is not approved. Review the reference decision again.');
 requireRule(industryKey(reference!.industry)===industryKey(company.industry!.value),'Customer reference does not match the confirmed industry.');
 return reference!;
}
export function invalidateProspect(company:SelectedProspect,from:'contact'|'industry'|'reference'){
 if(from==='contact'){company.contactId=null;company.industry=null;}
 if(from==='industry')company.industry=null;
 company.decision=null;for(const draft of company.drafts)draft.invalidated=true;
}
export function validateReferenceApproval(reference:CustomerReference){
 requireRule(!reference.logoOnly,'A logo alone cannot support implementation or performance claims.');
 requireRule(reference.customerEntity&&reference.industry.trim()&&reference.application.trim()&&reference.permittedClaim.trim()&&reference.geographicScope.trim(),'Complete customer entity, industry, application, exact permitted claim and geographic scope before approval.');
 requireRule(reference.sourceUrl||reference.materialName,'A source URL or uploaded/pasted material excerpt is required.');
 requireRule(reference.excerpt.trim().length>=10,'A supporting excerpt is required.');
}

export type OutreachStatus='new'|'accepted'|'checked/pending'|'declined'|'wrong contact';
export type OutreachChannel='connection'|'linkedin'|'email';
export type Relationship={text:string;occurredOn:string;confirmedBy:string;confirmedAt:string;note:string};
export type ContactOutreach={status:OutreachStatus;updatedAt:string;reviewer:string;note:string;history:Relationship|null};
export type OutreachState={connectionLimit:number;contacts:Record<string,ContactOutreach>;sends:{id:string;draftId:string;contactKey:string;channel:OutreachChannel;text:string;sentAt:string;recordedAt:string;recordedBy:string}[]};
export type DraftSupport={label:string;claim:string;sourceUrl:string|null;approvedBy:string;approvedAt:string};
export type LiveDraft={id:string;text:string;model:string;responseId:string;createdAt:string;invalidated:boolean;referenceId:string|null;referenceVersion:number|null;contactKey?:string;channel?:OutreachChannel;warm?:boolean;version?:number;parentId?:string|null;characterLimit?:number;support?:DraftSupport[];approvedBy?:string|null;approvedAt?:string|null};
export const characterCount=(text:string)=>Array.from(text).length;
export function outreachState(c:SelectedProspect){return c.outreach??={connectionLimit:300,contacts:{},sends:[]};}
export function outreachContactKey(c:SelectedProspect){const contact=contactGate(c);return entityKey(contact.name)+'@'+entityKey(contact.entity);}
export function outreachContact(c:SelectedProspect){const key=outreachContactKey(c);return outreachState(c).contacts[key]??{status:'new' as const,updatedAt:'',reviewer:'',note:'',history:null};}
export function outreachRoute(c:SelectedProspect):OutreachChannel{
 const state=outreachContact(c);if(!state.reviewer||!state.updatedAt)throw new ProspectRuleError('status_required','BDR must check existing connection/invitation status before drafting.');if(state.status==='declined')throw new ProspectRuleError('stopped','Contact declined. Outreach stopped.');
 if(state.status==='wrong contact')throw new ProspectRuleError('rediscovery_required','Wrong contact: return to contact discovery.');
 if(state.status==='accepted')return 'linkedin';if(state.status==='checked/pending')return 'email';
 if(outreachState(c).sends.some(s=>s.contactKey===outreachContactKey(c)&&s.channel==='connection'))throw new ProspectRuleError('invitation_exists','Invitation already recorded. Confirm its status; another connection request is blocked.');
 return 'connection';
}
export function currentDraft(c:SelectedProspect,id:string){const draft=c.drafts.find(d=>d.id===id);if(!draft||draft!==c.drafts.at(-1)||draft.invalidated||!draft.channel||draft.contactKey!==outreachContactKey(c)||draft.channel!==outreachRoute(c))throw new ProspectRuleError('stale_draft','Use the latest valid draft for the current contact and status.');return draft;}
