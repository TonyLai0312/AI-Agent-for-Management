import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fetch as proxyFetch,Response} from 'undici';
import {createGmailProvider,alertMessageId} from '../lib/server/gmail-alerts';
import type {AlertPayload} from '../lib/monitoring';
test('Gmail draft, final recipient check and provider evidence use the frozen payload without a delivery claim',async()=>{
 const saved={token:process.env.GMAIL_ACCESS_TOKEN,from:process.env.EMAIL_FROM,to:process.env.EVOX_TEST_RECIPIENT};process.env.GMAIL_ACCESS_TOKEN='explicit-synthetic-test-token';process.env.EMAIL_FROM='sender@example.org';process.env.EVOX_TEST_RECIPIENT='test@example.org';
 try{
 const payload:AlertPayload={from:'sender@example.org',to:'test@example.org',subject:'[EVOX TEST] Status check',text:'Explicit synthetic QA email body.'};const key='explicit-qa-key',messageId=`<${alertMessageId(key)}>`;let posts=0,tampered=false,raw='';
 const transport=(async(url:any,options:any)=>{const path=new URL(String(url)).pathname;if(path.endsWith('/profile'))return new Response(JSON.stringify({emailAddress:payload.from}));
 if(path.endsWith('/drafts')&&options.method==='POST'){raw=Buffer.from(JSON.parse(options.body).message.raw,'base64url').toString('utf8');return new Response(JSON.stringify({id:'qa-draft'}));}
 if(path.endsWith('/drafts/qa-draft'))return new Response(JSON.stringify({message:{payload:{headers:[{name:'To',value:tampered?'wrong@example.org':payload.to},{name:'From',value:payload.from},{name:'Message-ID',value:messageId}],body:{data:Buffer.from(payload.text).toString('base64url')}}}}));
 if(path.endsWith('/drafts/send')){posts++;assert.deepEqual(JSON.parse(options.body),{id:'qa-draft'});return new Response(JSON.stringify({id:'qa-sent-message',labelIds:['SENT']}));}
 if(path.endsWith('/messages/qa-sent-message'))return new Response(JSON.stringify({id:'qa-sent-message',labelIds:['SENT'],payload:{headers:[{name:'Message-ID',value:messageId},{name:'To',value:payload.to}]}}));
 throw new Error('Unexpected QA request');}) as typeof proxyFetch;
 const provider=createGmailProvider(transport);const draft=await provider.prepare(payload,key);assert.equal(draft.draftId,'qa-draft');assert.ok(raw.includes(`To: ${payload.to}\r\n`));assert.ok(raw.includes(`Message-ID: ${messageId}`));assert.equal(raw.includes('Bcc:'),false);
 tampered=true;await assert.rejects(()=>provider.send(draft.draftId,payload,key),/differs/);assert.equal(posts,0);tampered=false;
 const sent=await provider.send(draft.draftId,payload,key);assert.equal(posts,1);assert.equal(sent.providerId,'qa-sent-message');assert.equal(sent.evidence.lastEvent,null);assert.deepEqual(sent.evidence.labels,['SENT']);assert.equal(sent.evidence.realProvider,false);assert.equal((await provider.lookup(key,sent.providerId)).providerId,sent.providerId);
 process.env.EVOX_TEST_RECIPIENT='changed@example.org';await assert.rejects(()=>provider.prepare(payload,key),/differs/);assert.equal(posts,1);
 }finally{for(const [key,value] of Object.entries({GMAIL_ACCESS_TOKEN:saved.token,EMAIL_FROM:saved.from,EVOX_TEST_RECIPIENT:saved.to})){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
});
test('Gmail authentication errors retain status and redact raw body, token and headers',async()=>{
 const old={token:process.env.GMAIL_ACCESS_TOKEN,from:process.env.EMAIL_FROM,to:process.env.EVOX_TEST_RECIPIENT};process.env.GMAIL_ACCESS_TOKEN='private-synthetic-token';process.env.EMAIL_FROM='sender@example.org';process.env.EVOX_TEST_RECIPIENT='test@example.org';
 try{const transport=(async()=>new Response(JSON.stringify({error:{message:'private-synthetic-token'}}),{status:401,headers:{'x-private':'private-synthetic-token'}})) as typeof proxyFetch;await assert.rejects(()=>createGmailProvider(transport).prepare({from:'sender@example.org',to:'test@example.org',subject:'QA',text:'QA'},'qa'),(error:any)=>{assert.equal(error.code,'authentication');assert.equal(error.evidence.httpStatus,401);assert.equal(JSON.stringify(error).includes('private-synthetic-token'),false);return true;});}finally{for(const [key,value] of Object.entries({GMAIL_ACCESS_TOKEN:old.token,EMAIL_FROM:old.from,EVOX_TEST_RECIPIENT:old.to})){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
});
