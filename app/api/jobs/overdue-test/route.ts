import {authorizeMonitor,requireTestMonitoring} from '@/lib/server/monitor-auth';
import {runOverdue,recordSchedulerRun} from '@/lib/server/monitor-store';
import {monitorFailure,monitorHeaders} from '@/lib/server/monitor-http';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function POST(req:Request){try{authorizeMonitor(req,'cron');requireTestMonitoring();await recordSchedulerRun('test');const result=await runOverdue('test');return Response.json({ok:!result.alerts.some(a=>a.state==='failed'),total:result.alerts.length,states:result.alerts.map(a=>a.state),deliveryConfirmed:false},{headers:monitorHeaders});}catch(error){return monitorFailure(error);}}
