import {authorizeMonitor} from '@/lib/server/monitor-auth';
import {runOverdue,recordSchedulerRun} from '@/lib/server/monitor-store';
import {monitorFailure,monitorHeaders} from '@/lib/server/monitor-http';
export const runtime='nodejs';
export const dynamic='force-dynamic';
async function run(request:Request){try{authorizeMonitor(request,'cron');await recordSchedulerRun('live');const result=await runOverdue('live');return Response.json({ok:!result.alerts.some(a=>a.state==='failed'),checkedAt:result.now,counts:{queued:result.alerts.filter(a=>a.state==='queued').length,providerAccepted:result.alerts.filter(a=>a.state==='provider-accepted').length,failed:result.alerts.filter(a=>a.state==='failed').length,resolved:result.alerts.filter(a=>a.state==='resolved').length},deliveryConfirmed:false},{headers:monitorHeaders});}catch(error){return monitorFailure(error);}}
export const GET=run;
export const POST=run;
