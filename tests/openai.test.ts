import {test} from 'node:test';
import assert from 'node:assert/strict';
import OpenAI from 'openai';
import {researchWithSources,checkConnection,generateApprovedDraft,safeError,configuration,createClient,type ResponsesClient,type ApprovedDraftInput} from '../lib/server/openai';
import {prepareOpenAI,finishOpenAI} from '../lib/server/openai-workflow';
import {fixtures} from '../lib/demo-fixtures';
import {applyAction,actionSchema} from '../lib/demo-service';
const input:ApprovedDraftInput={channel:'connection',contactName:'Alex Demo',contactRole:'CFO',company:'Fixture Foods',industry:'Food & Beverage Manufacturing',approvedClaim:'EVOX supported SKU-level costing for Wei Chuan Group Foods.',entity:'Wei Chuan Group Foods',characterLimit:300,demo:true};
function mock(text:string,status='completed',capture?:(body:any)=>void):ResponsesClient{return {responses:{create:async(body:any)=>{capture?.(body);return {id:'resp_fixture',status,output_text:text}}}} as unknown as ResponsesClient}
function ready(){const s=fixtures();for(const a of [{action:'select',selected:true},{action:'approve-contact'},{action:'approve-industry'},{action:'approve-evidence',evidenceId:'evidence-qualified'}])applyAction(s,actionSchema.parse({...a,companyId:'qualified',version:s.campaign.version}),'BDR');return s}
test('minimal connection check uses Responses, store false and constant input',async()=>{let body:any;const result=await checkConnection(mock('OK','completed',b=>body=b));assert.equal(result.ok,true);assert.equal(body.store,false);assert.equal(body.input,'Connection check.');assert.equal(body.max_output_tokens,32);assert.equal('apiKey' in body,false)});
test('structured drafting keeps exact approved claim and records provenance',async()=>{let body:any;const message=`Hi Alex Demo, ${input.approvedClaim} Open to connecting?`;const result=await generateApprovedDraft(input,mock(JSON.stringify({message}),'completed',b=>body=b));assert.equal(result.text,message);assert.equal(result.promptVersion,'evox-draft-v3');assert.equal(body.store,false);assert.equal(body.text.format.strict,true);assert.deepEqual(JSON.parse(body.input),input);assert.equal(body.tools,undefined)});
test('malformed, incomplete, overlong, changed claims, links and invented metrics are rejected',async()=>{for(const response of ['not json',JSON.stringify({message:'X'.repeat(301)}),JSON.stringify({message:'Invented claim'}),JSON.stringify({message:`${input.approvedClaim} Save 70% today`}),JSON.stringify({message:`${input.approvedClaim} See https://example.com`})])await assert.rejects(()=>generateApprovedDraft(input,mock(response)));await assert.rejects(()=>generateApprovedDraft(input,mock('{}','incomplete')),/did not complete/)});
test('SDK credential errors are sanitized; no raw message or headers returned',()=>{const marker='sensitive-test-marker';const raw=new OpenAI.APIError(401,{message:marker},marker,new Headers({'x-private':marker}));const safe=safeError(raw);assert.equal(safe.code,'authentication_failed');assert.equal(JSON.stringify(safe).includes(marker),false);assert.equal(safe.message.includes(marker),false);assert.equal(safeError(new Error(marker)).message.includes(marker),false)});
test('missing configuration fails clearly without making a request',()=>{const old=process.env.OPENAI_API_KEY;delete process.env.OPENAI_API_KEY;try{assert.equal(configuration().configured,false);assert.throws(()=>createClient(),/not available to the server/)}finally{if(old!==undefined)process.env.OPENAI_API_KEY=old}});
test('gate validation happens before AI work; preparation does not modify saved state',()=>{const s=fixtures();assert.throws(()=>prepareOpenAI(s,{action:'generate-openai',version:s.campaign.version,companyId:'qualified'},'BDR'),/Select/);const r=ready();const before=structuredClone(r);const context=prepareOpenAI(r,{action:'generate-openai',version:r.campaign.version,companyId:'qualified'},'BDR');assert.deepEqual(r,before);assert.equal(context.demo,true);assert.equal(context.approvedClaim,input.approvedClaim);assert.throws(()=>prepareOpenAI(r,{action:'generate-openai',version:r.campaign.version,companyId:'qualified'},'GM'),/BDR role/)});
test('result never auto-approves and concurrent edits reject stale AI output',()=>{const s=ready(),action={action:'generate-openai' as const,version:s.campaign.version,companyId:'qualified'};const result={text:'A reviewed candidate',model:'fixture-model',responseId:'resp_fixture',generatedAt:new Date().toISOString(),promptVersion:'evox-draft-v2' as const};const finished=finishOpenAI(structuredClone(s),action,'BDR',result);assert.equal(finished.drafts.at(-1)!.approved,false);assert.equal(finished.drafts.at(-1)!.provider,'openai');assert.equal(finished.drafts.at(-1)!.responseId,'resp_fixture');s.campaign.version++;assert.throws(()=>finishOpenAI(s,action,'BDR',result),/changed during AI generation/)});

test('draft and research model overrides are independent',()=>{
 const oldDraft=process.env.OPENAI_DRAFT_MODEL,oldResearch=process.env.OPENAI_RESEARCH_MODEL;
 try{process.env.OPENAI_DRAFT_MODEL='draft-model';process.env.OPENAI_RESEARCH_MODEL='research-model';assert.equal(configuration().model,'draft-model');assert.equal(configuration().researchModel,'research-model');}
 finally{if(oldDraft===undefined)delete process.env.OPENAI_DRAFT_MODEL;else process.env.OPENAI_DRAFT_MODEL=oldDraft;if(oldResearch===undefined)delete process.env.OPENAI_RESEARCH_MODEL;else process.env.OPENAI_RESEARCH_MODEL=oldResearch;}
});
test('research requires a completed search and genuine citation annotations',async()=>{
 let body:any;
 const output:any[]=[{type:'web_search_call',status:'completed'},{type:'message',content:[{type:'output_text',annotations:[{type:'url_citation',url:'https://developers.openai.com/',title:'OpenAI',start_index:0,end_index:4}]}]}];
 const client={responses:{create:async(b:any)=>{body=b;return {status:'completed',model:'research-model',id:'resp_test',output_text:'Text',output};}}} as unknown as ResponsesClient;
 const result=await researchWithSources('Research',client);
 assert.equal(result.sources[0].url,'https://developers.openai.com/');assert.equal(body.tools[0].type,'web_search');assert.equal(body.tool_choice,'required');assert.equal(body.store,false);assert.equal(body.model,configuration().researchModel);
 output.shift();await assert.rejects(()=>researchWithSources('Research',client),/source citations/);
 output.splice(0);await assert.rejects(()=>researchWithSources('Research',client),/source citations/);
});
test('billing quota is distinguished from authentication without exposing provider text',()=>{
 const raw=new OpenAI.APIError(429,{code:'insufficient_quota',message:'private'},'private',new Headers());
 assert.equal(safeError(raw).code,'billing_quota');assert.equal(safeError(raw).message.includes('private'),false);
});
test('authentication diagnostics retain allowlisted provider metadata and never masked credentials',()=>{
 const old=process.env.OPENAI_API_KEY;
 const synthetic='test-placeholder-value-for-binding';
 process.env.OPENAI_API_KEY=synthetic;
 try{
  const raw=new OpenAI.APIError(401,{type:'invalid_request_error',code:'invalid_api_key',message:'Incorrect API key provided: test-***-binding. You can find your API key at the provider.'},'provider details',new Headers({'x-request-id':'req_123456789abcdef0'}));
  const safe=safeError(raw);
  assert.equal(safe.upstreamStatus,401);assert.equal(safe.providerType,'invalid_request_error');assert.equal(safe.providerCode,'invalid_api_key');assert.equal(safe.requestId,'req_123456789abcdef0');assert.equal(safe.credentialSubstitutionSuspected,true);
  assert.equal(JSON.stringify(safe).includes(synthetic),false);assert.equal(JSON.stringify(safe).includes('test-***'),false);
 }finally{if(old===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=old;}
});
