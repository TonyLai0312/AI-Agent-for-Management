import {createHash} from 'node:crypto';
import {EnvHttpProxyAgent,fetch as proxyFetch} from 'undici';
import {z} from 'zod';
import {MonitorError,type AlertPayload,type ProviderEvidence} from '../monitoring';
const providerId=z.string().regex(/^[A-Za-z0-9_-]{1,200}$/);
export class GmailError extends MonitorError{constructor(code:string,message:string,public evidence:ProviderEvidence,public retryable:boolean){super(code,message,502);}}
export interface AlertEmailProvider{
 realProvider:boolean;
 configuration():{from:string;to:string};
 prepare(payload:AlertPayload,key:string):Promise<{draftId:string;evidence:ProviderEvidence}>;
 send(draftId:string,payload:AlertPayload,key:string):Promise<{providerId:string;evidence:ProviderEvidence}>;
 lookup(key:string,providerId?:string|null):Promise<{providerId:string|null;evidence:ProviderEvidence}>;
}
const now=()=>new Date().toISOString();
export const alertMessageId=(key:string)=>`evox-${createHash('sha256').update(key).digest('hex')}@alerts.evox.invalid`;
export function gmailConfiguration(){
 const from=process.env.EMAIL_FROM?.trim(),to=process.env.EVOX_TEST_RECIPIENT?.trim(),token=process.env.GMAIL_ACCESS_TOKEN?.trim();
 if(!token||token.startsWith('YOUR_'))throw new MonitorError('configuration','GMAIL_ACCESS_TOKEN is not configured. Provide an authorized Gmail OAuth access token.',503);
 if(!from||!z.email().safeParse(from).success||!to||!z.email().safeParse(to).success)throw new MonitorError('configuration','Set EMAIL_FROM to the Gmail account address and EVOX_TEST_RECIPIENT to the configured test mailbox.',503);
 return {from,to};
}
export function emailReadiness(){let configured=false;try{gmailConfiguration();configured=true;}catch{}return {configured,recipientConfigured:!!z.email().safeParse(process.env.EVOX_TEST_RECIPIENT).success,provider:'gmail' as const,testRecipientOnly:true as const};}
let agent:EnvHttpProxyAgent|undefined;
async function api(path:string,operation:ProviderEvidence['operation'],body:unknown,transport:typeof proxyFetch){
 gmailConfiguration();agent??=new EnvHttpProxyAgent();let response;
 try{response=await transport(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${process.env.GMAIL_ACCESS_TOKEN!.trim()}`,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,dispatcher:agent,signal:AbortSignal.timeout(12000),redirect:'error'});}catch{throw new GmailError('network','Gmail request failed or timed out. No delivery claim is made.',{at:now(),operation,realProvider:transport===proxyFetch,httpStatus:null,providerId:null,requestId:null,code:'network',lastEvent:null},true);}
 const evidence:ProviderEvidence={at:now(),operation,realProvider:transport===proxyFetch,httpStatus:response.status,providerId:null,requestId:null,code:null,lastEvent:null};
 const requestId=response.headers.get('x-request-id');if(requestId&&/^[A-Za-z0-9_.:-]{1,150}$/.test(requestId))evidence.requestId=requestId;
 let data:any;try{const raw=await response.text();if(raw.length>65536)throw new Error();data=JSON.parse(raw);}catch{throw new GmailError('invalid_provider_response','Gmail returned an unreadable response.',{...evidence,code:'invalid_provider_response'},true);}
 if(!response.ok){const code=response.status===401?'authentication':response.status===403?'permission_or_network_policy':response.status===429?'quota':response.status===404?'not_found':response.status>=500?'provider_unavailable':'provider_rejected';throw new GmailError(code,`Gmail request failed (HTTP ${response.status}). ${code==='authentication'?'Refresh the authorized OAuth access token.':code==='permission_or_network_policy'?'Check Gmail API enablement, OAuth scopes and network policy.':'See retained sanitized provider evidence.'}`,{...evidence,code},response.status===429||response.status>=500);}
 return {data,evidence};
}
function invalid(evidence:ProviderEvidence):never{throw new GmailError('invalid_provider_response','Gmail response failed validation. No acceptance or delivery is assumed.',{...evidence,code:'invalid_provider_response'},true);}
export function createGmailProvider(transport:typeof proxyFetch=proxyFetch):AlertEmailProvider{
 const request=(path:string,operation:ProviderEvidence['operation'],body?:unknown)=>api(path,operation,body,transport);
 return {
 realProvider:transport===proxyFetch,configuration:gmailConfiguration,
 async prepare(payload,key){
  const configuration=gmailConfiguration();if(payload.to!==configuration.to||payload.from!==configuration.from)throw new MonitorError('recipient_changed','Frozen email sender/recipient differs from the configured test mailbox. Dispatch blocked.',409);
  const profile=await request('profile','prepare');if(String(profile.data.emailAddress).toLowerCase()!==payload.from.toLowerCase())throw new MonitorError('sender_mismatch','EMAIL_FROM must match the authorized Gmail account address.',422);
  const subject=`=?UTF-8?B?${Buffer.from(payload.subject).toString('base64')}?=`;
  const mime=[`From: ${payload.from}`,`To: ${payload.to}`,`Subject: ${subject}`,`Message-ID: <${alertMessageId(key)}>`,`MIME-Version: 1.0`,`Content-Type: text/plain; charset=UTF-8`,`Content-Transfer-Encoding: base64`,'',(Buffer.from(payload.text).toString('base64').match(/.{1,76}/g)??[]).join('\r\n')].join('\r\n');
  const result=await request('drafts','prepare',{message:{raw:Buffer.from(mime).toString('base64url')}});const id=providerId.safeParse(result.data.id);if(!id.success)invalid(result.evidence);return {draftId:id.data,evidence:{...result.evidence,draftId:id.data,payloadHash:createHash('sha256').update(JSON.stringify(payload)).digest('hex')}};
 },
 async send(draftId,payload,key){
  providerId.parse(draftId);const config=gmailConfiguration();if(payload.to!==config.to||payload.from!==config.from)throw new MonitorError('recipient_changed','Configured test mailbox changed. Dispatch blocked.',409);
  const draft=await request(`drafts/${draftId}?format=full`,'prepare');const headers=draft.data.message?.payload?.headers;
  const header=(name:string)=>Array.isArray(headers)?headers.filter((h:any)=>String(h.name).toLowerCase()===name).map((h:any)=>String(h.value)):[];
  const to=header('to'),from=header('from'),messageId=header('message-id');
  const body=typeof draft.data.message?.payload?.body?.data==='string'?Buffer.from(draft.data.message.payload.body.data,'base64url').toString('utf8'):null;
  if(to.length!==1||to[0].toLowerCase()!==config.to.toLowerCase()||from.length!==1||from[0].toLowerCase()!==config.from.toLowerCase()||header('cc').length||header('bcc').length||messageId.length!==1||messageId[0]!==`<${alertMessageId(key)}>`||body?.replace(/\r\n/g,'\n').trimEnd()!==payload.text.replace(/\r\n/g,'\n').trimEnd())throw new MonitorError('draft_changed','Gmail draft differs from the frozen test-recipient payload. Dispatch blocked.',409);
const result=await request('drafts/send','send',{id:draftId});const id=providerId.safeParse(result.data.id);if(!id.success||!Array.isArray(result.data.labelIds)||!result.data.labelIds.includes('SENT'))invalid(result.evidence);
  return {providerId:id.data,evidence:{...result.evidence,providerId:id.data,draftId,labels:['SENT']}};
 },
 async lookup(key,id){
  let evidence:ProviderEvidence={at:now(),operation:'retrieve',realProvider:transport===proxyFetch,httpStatus:null,providerId:null,requestId:null,code:null,lastEvent:null};
  if(!id){const list=await request(`messages?maxResults=2&q=${encodeURIComponent(`in:sent rfc822msgid:${alertMessageId(key)}`)}`,'retrieve');evidence=list.evidence;if(!list.data.messages?.length)return {providerId:null,evidence};if(list.data.messages.length!==1)invalid(evidence);id=providerId.parse(list.data.messages[0].id);}
  const result=await request(`messages/${providerId.parse(id)}?format=metadata&metadataHeaders=Message-ID&metadataHeaders=To`,'retrieve');const headers=result.data.payload?.headers;const msgId=Array.isArray(headers)?headers.find((h:any)=>String(h.name).toLowerCase()==='message-id')?.value:null;
  const to=Array.isArray(headers)?headers.find((h:any)=>String(h.name).toLowerCase()==='to')?.value:null;
  if(msgId!==`<${alertMessageId(key)}>`||String(to).toLowerCase()!==gmailConfiguration().to.toLowerCase()||!result.data.labelIds?.includes('SENT'))invalid(result.evidence);
  return {providerId:id!,evidence:{...result.evidence,providerId:id!,labels:['SENT']}};
 }
};
}
export const gmailProvider=createGmailProvider();
