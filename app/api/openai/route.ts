import {cookies} from 'next/headers';
import {sessionRole} from '@/lib/demo-db';
import {configuration,checkConnection,safeError} from '@/lib/server/openai';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(){return Response.json({...configuration(),provider:'openai',research:'fixtures',drafting:'optional-responses-api'},{headers:{'Cache-Control':'no-store'}})}
let lastCheck=0;
export async function POST(req:Request){
 const origin=req.headers.get('origin');if(origin&&new URL(origin).host!==req.headers.get('host'))return Response.json({error:'Cross-origin mutations rejected'},{status:403});
 const role=await sessionRole((await cookies()).get('evox-demo-session')?.value);if(role!=='GM')return Response.json({error:'GM role required'},{status:403});
 if(Date.now()-lastCheck<10000)return Response.json({error:'Wait ten seconds before testing again.'},{status:429});lastCheck=Date.now();
 try{return Response.json(await checkConnection())}catch(error){const safe=safeError(error);return Response.json({error:safe.message,code:safe.code},{status:safe.status})}
}
