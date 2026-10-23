import {db} from '@/lib/demo-db';
export async function GET(){try{await (await db()).query('SELECT 1');return Response.json({name:'EVOX Prospect Copilot',mode:'demo',storage:'embedded-postgresql',research:'fixtures',email:'demo-outbox-only'})}catch{return Response.json({error:'Database unavailable'},{status:503})}}
