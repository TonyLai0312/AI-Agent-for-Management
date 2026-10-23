import {cookies} from 'next/headers';
import {z} from 'zod';
import {sessionRole} from '@/lib/demo-db';
import {researchProfileSchema} from '@/lib/market-research';
import {OpenAIIntegrationError,safeError} from '@/lib/server/openai';
import {researchWorkspace,startResearch,updateResearchProfile,reviewResearchEvidence} from '@/lib/server/research-store';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const bodySchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('profile'),version:z.number().int().positive(),profile:researchProfileSchema}).strict(),
 z.object({action:z.literal('run'),version:z.number().int().positive()}).strict(),
 z.object({action:z.literal('review'),version:z.number().int().positive(),evidenceId:z.string().uuid(),status:z.enum(['verified','rejected','unverified']),note:z.string().trim().min(10).max(1000),confirmed:z.literal(true)}).strict(),
]);
const headers={'Cache-Control':'no-store'};
export async function GET(){try{return Response.json(await researchWorkspace(),{headers});}catch{return Response.json({error:'Research storage unavailable.'},{status:503,headers});}}
export async function POST(req:Request){try{
 const origin=req.headers.get('origin');if(origin&&new URL(origin).host!==req.headers.get('host'))throw new OpenAIIntegrationError('forbidden','Cross-origin mutations rejected.',403);
 const role=await sessionRole((await cookies()).get('evox-demo-session')?.value);if(!role)throw new OpenAIIntegrationError('unauthenticated','Choose a demo identity before using this restricted prototype.',401);
 const reader=req.body?.getReader();if(!reader)throw new OpenAIIntegrationError('invalid_input','Request body required.',400);
 const chunks:Uint8Array[]=[];let length=0;
 while(true){const next=await reader.read();if(next.done)break;length+=next.value.length;if(length>32768){await reader.cancel();throw new OpenAIIntegrationError('request_too_large','Research request exceeds 32 KiB.',413);}chunks.push(next.value);}
 let raw:unknown;try{raw=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new OpenAIIntegrationError('invalid_input','Invalid JSON.',400);}
 const parsed=bodySchema.safeParse(raw);if(!parsed.success)throw new OpenAIIntegrationError('invalid_input','Research input failed validation. Check profile dates, criteria and review notes.',400);
 const body=parsed.data;if(body.action!=='review'&&role!=='GM')throw new OpenAIIntegrationError('forbidden','GM role required to edit the live profile or run research.',403);
 const result=body.action==='run'?await startResearch(body.version):body.action==='profile'?await updateResearchProfile(body.profile,body.version):await reviewResearchEvidence(body,role);
 return Response.json(result,{status:body.action==='run'&&result.job?.status==='failed'?502:200,headers});
 }catch(error){const safe=safeError(error);return Response.json({error:safe.message,code:safe.code,requestId:safe.requestId},{status:safe.status,headers});}}
