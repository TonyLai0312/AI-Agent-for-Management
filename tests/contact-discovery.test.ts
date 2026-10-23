import {test} from 'node:test';
import assert from 'node:assert/strict';
import {discoverPublicContacts} from '../lib/server/contact-discovery';
import type {ResponsesClient} from '../lib/server/openai';
const name='Alex Fixture';
const source={url:'https://example.org/team',title:'Explicit test team fixture',passage:'Alex Fixture is the CFO of Example Fixture Foods.',publicationDate:'2020-01-01'};
const input={name:'Example Fixture Foods',country:'Indonesia',aliases:[]};
function mock(data:unknown,extra:string[]=[]){let count=0;const urls=[source.url,...extra];return {responses:{create:async()=>++count===1?{id:'fixture-web',model:'fixture',status:'completed',output_text:source.passage,output:[{type:'web_search_call',status:'completed'},{type:'message',content:[{type:'output_text',annotations:urls.map(url=>({type:'url_citation',url,title:'Test source',start_index:0,end_index:10}))}]}]}:{id:'fixture-extract',model:'fixture',status:'completed',output:[],output_text:JSON.stringify(data)}}} as unknown as ResponsesClient;}
const candidate={name,title:'CFO',entity:input.name,profileUrl:null,source,ambiguous:false,potentiallyOutdated:false,reason:''};
test('public discovery retains required fields, flags old sources and never auto-verifies',async()=>{
 const result=await discoverPublicContacts(input,mock({contacts:[candidate],companyPage:null,manualSearchTask:null}));const contact=result.contacts[0];
 assert.equal(contact.name,name);assert.equal(contact.title,'CFO');assert.equal(contact.entity,input.name);assert.equal(contact.profileUrl,null);assert.equal(contact.source.url,source.url);assert.equal(contact.status,'unverified');assert.ok(contact.checkedAt);assert.ok(contact.flags.some(flag=>flag.includes('outdated')));assert.equal(contact.confirmedBy,null);
});
test('invented profile URLs or names absent from a supporting passage fail explicitly',async()=>{
 for(const invalid of [{...candidate,profileUrl:'https://example.org/invented-profile'},{...candidate,name:'Invented Person'}])await assert.rejects(()=>discoverPublicContacts(input,mock({contacts:[invalid],companyPage:null,manualSearchTask:null})),/cited|absent/);
});
test('ambiguous entities and undated sources remain flagged',async()=>{
 const result=await discoverPublicContacts(input,mock({contacts:[{...candidate,entity:'Different Fixture Subsidiary',ambiguous:true,source:{...source,publicationDate:null}}],companyPage:null,manualSearchTask:null}));assert.ok(result.contacts[0].flags.some(f=>f.includes('Ambiguous')));assert.ok(result.contacts[0].flags.some(f=>f.includes('entity differs')));assert.ok(result.contacts[0].flags.some(f=>f.includes('Undated')));
});
test('cited company LinkedIn fallback remains unverified; missing page creates a manual search task',async()=>{
 const url='https://www.linkedin.com/company/explicit-test-fixture/';const fallback=await discoverPublicContacts(input,mock({contacts:[],companyPage:{url,source},manualSearchTask:null},[url]));assert.equal(fallback.companyPage?.status,'unverified');assert.match(fallback.manualSearchTask,/CFO/);
 const manual=await discoverPublicContacts(input,mock({contacts:[],companyPage:null,manualSearchTask:null}));assert.equal(manual.companyPage,null);assert.match(manual.manualSearchTask,/Example Fixture Foods/);
 await assert.rejects(()=>discoverPublicContacts(input,mock({contacts:[],companyPage:{url:'https://www.linkedin.com/in/a-person/',source},manualSearchTask:null},['https://www.linkedin.com/in/a-person/'])),/company page/);
});

test('reference retrieval creates only source-backed proposals from EVOX stories',async()=>{
 const {retrieveCustomerReferences}=await import('../lib/server/customer-references');
 const url='https://www.evoxplatform.com/customer-stories/explicit-test-case/';
 const reference={customerEntity:'Explicit Test Customer',industry:'Retail',application:'Budgeting',permittedClaim:'EVOX supported budgeting for Explicit Test Customer.',sourceUrl:url,excerpt:source.passage,materialName:null,geographicScope:'Test entity only',logoOnly:false,publicationDate:null};
 let count=0;const client={responses:{create:async()=>++count===1?{id:'web',model:'test',status:'completed',output_text:source.passage,output:[{type:'web_search_call',status:'completed'},{type:'message',content:[{type:'output_text',annotations:[{type:'url_citation',url,title:'Test source',start_index:0,end_index:10}]}]}]}:{id:'structured',model:'test',status:'completed',output:[],output_text:JSON.stringify({references:[reference]})}}} as unknown as ResponsesClient;
 const result=await retrieveCustomerReferences(client);assert.equal(result.length,1);assert.equal(result[0].sourceUrl,url);assert.equal('status' in result[0],false);assert.equal('approver' in result[0],false);
});
