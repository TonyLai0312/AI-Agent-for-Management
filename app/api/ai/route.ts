import {cookies} from 'next/headers';
import {z} from 'zod';
import {sessionRole} from '@/lib/demo-db';
import {aiAdapter} from '@/lib/server/ai-adapter';
import {OpenAIIntegrationError,safeError} from '@/lib/server/openai';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const requestSchema=z.object({task:z.enum(['research','contacts','match']),input:z.unknown()}).strict();
/** Suggestions only. No workflow records or approvals are changed by this route. */
export async function POST(req:Request){
 try{
  const origin=req.headers.get('origin');
  if(origin&&new URL(origin).host!==req.headers.get('host'))return Response.json({error:'Cross-origin mutations rejected'},{status:403});
  const role=await sessionRole((await cookies()).get('evox-demo-session')?.value);
  if(!role)return Response.json({error:'Demo session required; this endpoint is not production authentication.'},{status:401});
  const reader=req.body?.getReader();if(!reader)throw new OpenAIIntegrationError('invalid_input','JSON body required.',400);
  const chunks:Uint8Array[]=[];let size=0;
  while(true){const next=await reader.read();if(next.done)break;size+=next.value.byteLength;if(size>32768){await reader.cancel();throw new OpenAIIntegrationError('request_too_large','Request exceeds 32 KiB.',413);}chunks.push(next.value);}
  let raw:unknown;try{raw=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new OpenAIIntegrationError('invalid_input','Invalid JSON body.',400);}
  const parsed=requestSchema.safeParse(raw);if(!parsed.success)throw new OpenAIIntegrationError('invalid_input','Unknown AI task or invalid request shape.',400);
  const {task,input}=parsed.data;
  if((task==='research'&&role!=='GM')||(task!=='research'&&role!=='BDR'))return Response.json({error:'Role not permitted for this AI task.'},{status:403});
  if(task!=='research')throw new OpenAIIntegrationError('selection_required','Use the selected-company contact/evidence workflow. Unselected contact or reference tasks are not accepted.',409);
  const result=await aiAdapter.research(input);
  return Response.json({ok:true,task,...result},{headers:{'Cache-Control':'no-store'}});
 }catch(error){const safe=safeError(error);return Response.json({ok:false,code:safe.code,error:safe.message},{status:safe.status,headers:{'Cache-Control':'no-store'}});}
}
