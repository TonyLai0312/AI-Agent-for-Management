import {z} from 'zod';
import {MonitorError} from '@/lib/monitoring';
import {authorizeMonitor} from '@/lib/server/monitor-auth';
import {monitoringSnapshot,configureCalendar,setTestClock,seedTestInvitation,updateTestStatus,runOverdue,refreshProviderEvidence,retryAlert} from '@/lib/server/monitor-store';
import {monitorBody,monitorFailure,monitorHeaders} from '@/lib/server/monitor-http';
export const runtime='nodejs';export const dynamic='force-dynamic';
const namespace=z.enum(['live','test']),id=z.string().min(1).max(200),instant=z.iso.datetime({offset:true});
const actions=z.discriminatedUnion('action',[
 z.object({action:z.literal('calendar'),namespace,calendar:z.unknown()}).strict(),
 z.object({action:z.literal('clock'),namespace:z.literal('test'),now:instant}).strict(),
 z.object({action:z.literal('seed'),namespace:z.literal('test'),sentAt:instant}).strict(),
 z.object({action:z.literal('status'),namespace:z.literal('test'),sendId:id,status:z.enum(['accepted','checked/pending','declined','wrong contact'])}).strict(),
 z.object({action:z.literal('run'),namespace}).strict(),
 z.object({action:z.literal('evidence'),namespace,sendId:id}).strict(),
 z.object({action:z.literal('retry'),namespace,sendId:id}).strict()
]);
export async function GET(req:Request){try{authorizeMonitor(req,'admin');const value=namespace.safeParse(new URL(req.url).searchParams.get('namespace')??'live');if(!value.success)throw new MonitorError('invalid_input','Unknown monitoring namespace.',400);return Response.json(await monitoringSnapshot(value.data),{headers:monitorHeaders});}catch(error){return monitorFailure(error);}}
export async function POST(req:Request){try{authorizeMonitor(req,'admin');const parsed=actions.safeParse(await monitorBody(req));if(!parsed.success)throw new MonitorError('invalid_input','Monitoring action failed validation. Test clock and test records cannot target live data.',400);const a=parsed.data;const result=a.action==='calendar'?await configureCalendar(a.namespace,a.calendar):a.action==='clock'?await setTestClock(a.now):a.action==='seed'?await seedTestInvitation(a.sentAt):a.action==='status'?await updateTestStatus(a.sendId,a.status):a.action==='evidence'?await refreshProviderEvidence(a.namespace,a.sendId):a.action==='retry'?await retryAlert(a.namespace,a.sendId):await runOverdue(a.namespace);return Response.json(result,{headers:monitorHeaders});}catch(error){return monitorFailure(error);}}
