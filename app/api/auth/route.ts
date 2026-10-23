import {cookies} from 'next/headers';
import {z} from 'zod';
import {accountMode} from '@/lib/auth-mode';
import {sessionRole} from '@/lib/demo-db';
import {accountsConfigured,loginAccount,logoutAccount,sessionCookie,cookieSecure} from '@/lib/server/accounts';
export const runtime='nodejs';export const dynamic='force-dynamic';
const headers={'Cache-Control':'no-store'};
export async function GET(){try{return Response.json({mode:accountMode()?'accounts':'demo',configured:accountMode()?accountsConfigured():true,role:await sessionRole((await cookies()).get(sessionCookie)?.value)},{headers});}catch{return Response.json({error:'Authentication storage unavailable.'},{status:503,headers});}}
export async function POST(req:Request){try{
 const origin=req.headers.get('origin');if(origin&&new URL(origin).host!==req.headers.get('host'))return Response.json({error:'Cross-origin login rejected.'},{status:403,headers});
 if(!req.headers.get('content-type')?.includes('application/json'))return Response.json({error:'JSON required.'},{status:400,headers});
 const reader=req.body?.getReader();if(!reader)return Response.json({error:'Login input required.'},{status:400,headers});let size=0;const chunks:Uint8Array[]=[];while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>4096){await reader.cancel();return Response.json({error:'Login input too large.'},{status:413,headers});}chunks.push(part.value);}
 const parsed=z.object({email:z.email().max(250),password:z.string().min(1).max(256)}).strict().safeParse(JSON.parse(Buffer.concat(chunks).toString('utf8')));if(!parsed.success)return Response.json({error:'Valid email and password required.'},{status:400,headers});
 const result=await loginAccount(parsed.data.email,parsed.data.password);if(!result.ok)return Response.json({error:result.message},{status:result.status,headers});
 const jar=await cookies();await logoutAccount(jar.get(sessionCookie)?.value);jar.set(sessionCookie,result.token,{httpOnly:true,secure:cookieSecure(),sameSite:'strict',path:'/',maxAge:8*3600});return Response.json({role:result.role,expiresAt:result.expiresAt},{headers});
 }catch{return Response.json({error:'Login failed. Check account configuration.'},{status:503,headers});}}
export async function DELETE(req:Request){const origin=req.headers.get('origin');if(origin&&new URL(origin).host!==req.headers.get('host'))return Response.json({error:'Cross-origin logout rejected.'},{status:403,headers});try{const jar=await cookies();await logoutAccount(jar.get(sessionCookie)?.value);jar.delete(sessionCookie);return Response.json({ok:true},{headers});}catch{return Response.json({error:'Logout failed.'},{status:503,headers});}}
