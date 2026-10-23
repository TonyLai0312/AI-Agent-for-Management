import {accountMode} from '@/lib/auth-mode';
import {bootIdentity} from '@/lib/server/runtime-identity';
import {db} from '@/lib/demo-db';
export async function GET(){try{await (await db()).query('SELECT 1');return Response.json({name:'EVOX Prospect Copilot',bootId:bootIdentity,runtime:process.version,mode:accountMode()?'authenticated-single-campaign':'demo',storage:'embedded-postgresql',research:'fixtures',email:'gmail-test-recipient-monitoring; prospect outreach manual'})}catch{return Response.json({error:'Database unavailable'},{status:503})}}
