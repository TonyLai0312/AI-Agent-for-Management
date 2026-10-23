import {randomUUID} from 'node:crypto';
import {defaults,dueAt} from './workflow';
import type {DemoState,Company} from './demo-types';
export const DEMO_ID='evox-demo-campaign';
export function fixtures():DemoState {
 const clock='2026-10-23T02:00:00.000Z';
 const base={country:'Singapore',employees:1500,revenue:400,technology:'SAP',signalDate:'2026-10-15',selected:false,industryReason:'',decision:'',confidence:'Fixture only — not researched'};
 const companies:Company[]=[
 {...base,id:'qualified',name:'Meridian Foods (Demo)',industry:'Food & Beverage Manufacturing',signal:'Simulated FP&A leadership hiring',score:94,fixture:'Qualified prospect with a contact',industryOptions:['Food & Beverage Manufacturing'],contactId:'contact-qualified'},
 {...base,id:'no-contact',name:'Straits Chemicals (Demo)',country:'Malaysia',industry:'Chemical',signal:'Simulated regional planning programme',score:88,fixture:'No verified contact or company page',industryOptions:['Chemical'],contactId:null},
 {...base,id:'conflict',name:'Lotus Consumer Group (Demo)',country:'Thailand',industry:'FMCG',signal:'Simulated business-unit consolidation',score:86,fixture:'Conflicting industry evidence',industryOptions:['FMCG','Grocery Retail'],contactId:'contact-conflict'},
 {...base,id:'logo',name:'Archipelago Retail (Demo)',country:'Indonesia',industry:'Grocery Retail',signal:'Simulated store expansion',score:85,fixture:'Customer logo without a detailed story',industryOptions:['Grocery Retail'],contactId:'contact-logo'},
 {...base,id:'overdue',name:'Pacific Pharma (Demo)',country:'Philippines',industry:'Pharmaceutical',signal:'Simulated rolling forecast initiative',score:83,fixture:'Overdue invitation — no status update',industryOptions:['Pharmaceutical'],contactId:'contact-overdue',selected:true}
 ];
 const contacts=companies.filter(c=>c.contactId).map(c=>({id:c.contactId!,companyId:c.id,name:({qualified:'Alex Tan',conflict:'Narin Demo',logo:'Maya Demo',overdue:'Jamie Demo'} as Record<string,string>)[c.id],title:'Head of FP&A',entity:c.name,source:`https://example.com/demo/${c.id}/finance-team`,checkedAt:clock,verified:true,email:`${c.id}@example.com`,emailVerified:false}));
 const evidence=[
 {id:'evidence-qualified',companyId:'qualified',customer:'Wei Chuan Group Foods',entity:'Wei Chuan Group Foods',source:'Supplied Customer Stories deck, slide 3',passage:'SKU-level costing: ABC + system algorithms for granular per-SKU costs.',claim:'EVOX supported SKU-level costing for Wei Chuan Group Foods.',logoOnly:false,version:1},
 {id:'evidence-conflict',companyId:'conflict',customer:'Nongfu Spring',entity:'Nongfu Spring',source:'Supplied Customer Stories deck, slide 10',passage:'Integrated Budget Models: Covers sales, production, procurement, inventory, headcount, costs, taxes, and financial statements.',claim:'EVOX supported integrated budget models for Nongfu Spring.',logoOnly:false,version:1},
 {id:'evidence-logo',companyId:'logo',customer:'Example Retail Customer (Demo)',entity:'Entity scope not established',source:'Synthetic logo-only fixture',passage:'Customer logo only. No supporting story or approved claim.',claim:'',logoOnly:true,version:1},
 {id:'evidence-overdue',companyId:'overdue',customer:'Daiichi Sankyo China',entity:'Daiichi Sankyo China',source:'Supplied Customer Stories deck, slide 4',passage:'Agile budgeting framework with 12+ scenario models aligned to real-time policy and KPI shifts.',claim:'EVOX supported scenario-based budgeting for Daiichi Sankyo China.',logoOnly:false,version:1}
 ];
 const approvals:DemoState['approvals']=['contact','industry','evidence'].map(kind=>({id:randomUUID(),companyId:'overdue',kind:kind as 'contact'|'industry'|'evidence',active:true,evidenceId:null,evidenceVersion:null,at:'2026-10-12T01:00:00Z',actor:'BDR',note:'Seeded demo approval; evidence path: no customer claim'}));
 const text='Hi Jamie Demo, I’m with EVOX. I’d welcome a connection to exchange perspectives on FP&A and planning. Would you be open to connecting?';
 return {campaign:{id:DEMO_ID,name:'SEA FP&A · EMBA demo',demo:true,version:1,profile:{...defaults},clock,createdAt:new Date().toISOString()},companies,contacts,evidence,approvals,
 drafts:[{id:'draft-overdue',companyId:'overdue',contactId:'contact-overdue',channel:'connection',text,version:1,approved:true,invalidated:false,at:'2026-10-12T01:00:00Z',approvalAt:'2026-10-12T01:05:00Z',context:approvals.map(a=>a.id),evidenceId:null,evidenceVersion:null}],
 sends:[{id:'send-overdue',companyId:'overdue',contactId:'contact-overdue',draftId:'draft-overdue',channel:'connection',text,sentAt:'2026-10-12T02:00:00Z',recordedAt:'2026-10-12T02:05:00Z',dueAt:dueAt('2026-10-12T02:00:00Z'),status:null,updatedAt:null}],updates:[],alerts:[],events:[{id:randomUUID(),at:clock,actor:'GM',action:'seed',companyId:null,detail:'Demo campaign created. All company/contact research is synthetic; source passages are supplied reference candidates.'}]};
}
