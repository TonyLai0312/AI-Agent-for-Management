import {cookies} from 'next/headers';
import {sessionRole} from '@/lib/demo-db';
import {MonitorError} from '@/lib/monitoring';
import {monitoringSnapshot} from '@/lib/server/monitor-store';
import {monitorFailure,monitorHeaders} from '@/lib/server/monitor-http';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(){try{if(!await sessionRole((await cookies()).get('evox-demo-session')?.value))throw new MonitorError('forbidden','Campaign session required.',403);return Response.json(await monitoringSnapshot('live'),{headers:monitorHeaders});}catch(error){return monitorFailure(error);}}
