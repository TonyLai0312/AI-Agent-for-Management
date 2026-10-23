import {cookies} from 'next/headers';
import {db,load,save,serial,sessionRole,resetDemo} from '@/lib/demo-db';
import {actionSchema,applyAction,RuleError} from '@/lib/demo-service';
import {OpenAIIntegrationError} from '@/lib/server/openai';
import {aiAdapter} from '@/lib/server/ai-adapter';
import {prepareOpenAI,finishOpenAI} from '@/lib/server/openai-workflow';
import {DEMO_ID} from '@/lib/demo-fixtures';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(){try{const pg=await db();const state=await serial(()=>load(pg));const role=await sessionRole((await cookies()).get('evox-demo-session')?.value);return Response.json({state,role},{headers:{'Cache-Control':'no-store'}})}catch(error){console.error(error);return Response.json({error:'Demo database unavailable'},{status:503})}}
export async function POST(req:Request){
 try{
 const origin=req.headers.get('origin');if(origin&&new URL(origin).host!==req.headers.get('host'))return Response.json({error:'Cross-origin mutations rejected'},{status:403});
 const role=await sessionRole((await cookies()).get('evox-demo-session')?.value);if(!role)return Response.json({error:'Choose a demo identity first'},{status:401});
 const parsed=actionSchema.safeParse(await req.json());if(!parsed.success)return Response.json({error:parsed.error.issues.map(x=>x.message).join('; ')},{status:400});
 const pg=await db();
 if(parsed.data.action==='generate-openai'){
  const snapshot=await serial(()=>load(pg));const input=prepareOpenAI(snapshot,parsed.data,role);
  const generated=await aiAdapter.draft(input);
  const state=await serial(()=>pg.transaction(async tx=>{const current=await load(tx);const next=finishOpenAI(current,parsed.data,role,generated);await save(tx,next);return next}));
  return Response.json({state,role});
 }
 const state=await serial(()=>pg.transaction(async tx=>{const current=await load(tx);const a=parsed.data;
 if(a.action==='reset'){
  if(role!=='GM')throw new RuleError('GM role required',403);
  if(a.version!==current.campaign.version)throw new RuleError('Workspace changed. Refresh and retry.',409);
  if(a.confirmation!=='RESET DEMO'||current.campaign.id!==DEMO_ID||current.campaign.demo!==true)throw new RuleError('Type RESET DEMO to reset only this demonstration campaign');
  const check=await tx.query<{is_demo:boolean}>('SELECT is_demo FROM campaigns WHERE id=$1',[DEMO_ID]);if(!check.rows[0]?.is_demo)throw new RuleError('Non-demo campaigns cannot be reset',403);
  return resetDemo(tx,current);
 }
 const next=applyAction(current,a,role);await save(tx,next);return next;
 }));return Response.json({state,role});
 }catch(error){if(error instanceof OpenAIIntegrationError)return Response.json({error:error.message,code:error.code},{status:error.status});if(error instanceof RuleError)return Response.json({error:error.message},{status:error.status});if(error instanceof SyntaxError)return Response.json({error:'Invalid JSON'},{status:400});console.error(error);return Response.json({error:'Database operation failed; no partial change was saved'},{status:500})}
}
