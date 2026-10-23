import {cookies} from 'next/headers';
import {sessionRole} from '@/lib/demo-db';
import {prospectWorkspace,applyProspectAction} from '@/lib/server/prospect-store';
import {ProspectRuleError} from '@/lib/prospecting';
import {safeError} from '@/lib/server/openai';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'no-store'};
export async function GET(){try{const role=await sessionRole((await cookies()).get('evox-demo-session')?.value);if(!role)return Response.json({error:'Choose a demo identity before opening contacts or BDR-supplied evidence.'},{status:401,headers});return Response.json(await prospectWorkspace(),{headers});}catch{return Response.json({error:'Prospecting storage unavailable.'},{status:503,headers});}}
export async function POST(req:Request){try{
 const origin=req.headers.get('origin');if(origin&&new URL(origin).host!==req.headers.get('host'))throw new ProspectRuleError('forbidden','Cross-origin mutations rejected.',403);
 const role=await sessionRole((await cookies()).get('evox-demo-session')?.value);if(role!=='BDR')throw new ProspectRuleError('forbidden','BDR role required.',403);
 const reader=req.body?.getReader();if(!reader)throw new ProspectRuleError('invalid_input','JSON body required.',400);const chunks:Uint8Array[]=[];let size=0;
 while(true){const next=await reader.read();if(next.done)break;size+=next.value.byteLength;if(size>32768){await reader.cancel();throw new ProspectRuleError('request_too_large','Prospecting request exceeds 32 KiB.',413);}chunks.push(next.value);}
 let body:unknown;try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new ProspectRuleError('invalid_input','Invalid JSON.',400);}
 const result=await applyProspectAction(body,role);const input=body as {action:string;companyId?:string};const company=result.companies.find(c=>c.id===input.companyId);const job=input.action==='discover'?company?.discovery:input.action==='generate'?company?.generation:input.action==='refresh-references'?result.importStatus:null;
 return Response.json(result,{status:job?.status==='failed'?502:200,headers});
 }catch(error){if(error instanceof ProspectRuleError)return Response.json({error:error.message,code:error.code},{status:error.status,headers});const safe=safeError(error);return Response.json({error:safe.message,code:safe.code,requestId:safe.requestId},{status:safe.status,headers});}}
