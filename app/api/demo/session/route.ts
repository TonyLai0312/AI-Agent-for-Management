import {randomUUID} from 'node:crypto';
import {cookies} from 'next/headers';
import {db} from '@/lib/demo-db';
export async function POST(req:Request){
 const origin=req.headers.get('origin');if(origin&&new URL(origin).host!==req.headers.get('host'))return Response.json({error:'Cross-origin mutations rejected'},{status:403});
 let body;try{body=await req.json()}catch{return Response.json({error:'Invalid JSON'},{status:400})}
 if(!['GM','BDR'].includes(body.role))return Response.json({error:'Invalid demo role'},{status:400});
 const pg=await db();const jar=await cookies();const previous=jar.get('evox-demo-session')?.value;if(previous)await pg.query('DELETE FROM demo_sessions WHERE id=$1',[previous]);
 const id=randomUUID();await pg.query('INSERT INTO demo_sessions(id,role) VALUES($1,$2)',[id,body.role]);jar.set('evox-demo-session',id,{httpOnly:true,sameSite:'strict',secure:new URL(req.url).protocol==='https:',path:'/',maxAge:86400});return Response.json({role:body.role,demo:true});
}
