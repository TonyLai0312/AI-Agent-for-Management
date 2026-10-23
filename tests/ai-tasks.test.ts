import {test} from 'node:test';
import assert from 'node:assert/strict';
import {discoverCompanies,discoverContacts,matchIndustryAndReference} from '../lib/server/ai-tasks';
import {requestResponse,type ResponsesClient} from '../lib/server/openai';
import {createRequestLimiter} from '../lib/server/ai-limits';
import {references} from '../lib/references';
const url='https://example.org/company';
const web={status:'completed',id:'web',model:'fixture',output_text:'Public source finding',output:[{type:'web_search_call',status:'completed'},{type:'message',content:[{type:'output_text',annotations:[{type:'url_citation',url,title:'Company',start_index:0,end_index:6}]}]}]};
function client(...responses:unknown[]){let calls=0;return {client:{responses:{create:async(body:any)=>{assert.equal(body.store,false);calls++;return responses.shift();}}} as unknown as ResponsesClient,calls:()=>calls};}
function structured(data:unknown){return {status:'completed',id:'structured',model:'fixture',output_text:JSON.stringify(data),output:[]};}
const market={countries:['Singapore'],industries:['Chemical'],start:'2026-10-01',end:'2026-10-23'};
test('market discovery preserves unknown mandatory facts and returns pending verification',async()=>{
 const data={brief:'Finding',companies:[{name:'Candidate',country:'Singapore',industry:'Chemical',employees:null,annualRevenueUSD:null,rationale:'Needs review',sourceUrls:[url]}],uncertainties:['Revenue unknown']};
 const mock=client(web,structured(data));const result=await discoverCompanies(market,mock.client);
 assert.equal(result.verification,'needs_verification');assert.equal(result.data.companies[0].employees,null);assert.equal(mock.calls(),2);
 const invalid=structured({...data,companies:[{...data.companies[0],sourceUrls:['https://invented.example/']}]});
 await assert.rejects(()=>discoverCompanies(market,client(web,invalid).client),/not cited/);
});
test('invalid discovery criteria are rejected before any provider request',async()=>{
 const mock=client();await assert.rejects(()=>discoverCompanies({...market,end:'2020-01-01'},mock.client),/input failed/);assert.equal(mock.calls(),0);
});
test('contact discovery requires sourced identity or explicit manual search',async()=>{
 const input={company:'Candidate',country:'Singapore',roles:['CFO']};
 const data={contacts:[],companyLinkedInUrl:null,manualSearchTask:'Review public team page manually',uncertainties:['No source identifies CFO']};
 const result=await discoverContacts(input,client(web,structured(data)).client);assert.equal(result.data.contacts.length,0);
 await assert.rejects(()=>discoverContacts(input,client(web,structured({...data,manualSearchTask:null})).client),/manual-search/);
 await assert.rejects(()=>discoverContacts(input,client(web,structured({...data,contacts:[{name:'Person',role:'CFO',company:'Wrong company',sourceUrls:[url]}]})).client),/does not match/);
});
test('matching preserves exact catalog claim and rejects invented IDs and entity changes',async()=>{
 const ref=references[0],input={company:'Candidate',confirmedIndustry:ref.industry,evidence:'Human confirmed grocery business'};
 const data={industry:ref.industry,referenceId:ref.id,entity:ref.customer,claim:ref.claim,rationale:'Relevant industry',uncertainties:[]};
 assert.equal((await matchIndustryAndReference(input,client(structured(data)).client)).data.claim,ref.claim);
 for(const invalid of [{...data,referenceId:'invented'},{...data,entity:'Parent group'},{...data,claim:'Unsupported claim'}])await assert.rejects(()=>matchIndustryAndReference(input,client(structured(invalid)).client),/invented a reference/);
 const result=await matchIndustryAndReference(input,client(structured({...data,referenceId:null,entity:null,claim:null})).client);assert.equal(result.data.claim,null);
});
test('refusals and incomplete outputs fail explicitly without exposing refusal content',async()=>{
 const params={model:'fixture',input:'Hello',store:false,max_output_tokens:32};
 await assert.rejects(()=>requestResponse(params,'connection',client({status:'completed',output:[{type:'message',content:[{type:'refusal',refusal:'private-content'}]}]}).client),e=>e instanceof Error&&e.message.includes('declined')&&!e.message.includes('private-content'));
 await assert.rejects(()=>requestResponse(params,'connection',client({status:'incomplete',output:[]}).client),/did not complete/);
 await assert.rejects(()=>requestResponse({...params,input:'X'.repeat(30001)},'connection',client().client),/30,000/);
});
test('malformed structured JSON and schema mismatch fail without a fallback',async()=>{
 for(const response of [{...structured({}),output_text:'not json'},structured({unexpected:true})])await assert.rejects(()=>matchIndustryAndReference({company:'Candidate',confirmedIndustry:'Chemical',evidence:'Evidence'},client(response).client),/schema validation/);
});
test('request limiter enforces concurrency, rolling minute cap and idempotent release',()=>{
 let now=0;const admit=createRequestLimiter(2,1,()=>now);const release=admit();assert.throws(admit,/limit/);release();release();admit()();assert.throws(admit,/limit/);now=60001;admit()();
});
test('usage logs omit request and response content',async()=>{
 const logs:string[]=[];const old=console.info;console.info=(value)=>logs.push(value);
 try{await requestResponse({model:'fixture',store:false,input:'sensitive-input',max_output_tokens:32},'connection',client({...structured({message:'sensitive-output'}),usage:{input_tokens:3,output_tokens:4}}).client);}
 finally{console.info=old;}
 const log=logs.join('');assert.equal(log.includes('sensitive'),false);assert.equal(JSON.parse(log).inputTokens,3);assert.equal(JSON.parse(log).outputTokens,4);
});
