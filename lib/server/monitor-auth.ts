import {createHash,timingSafeEqual} from 'node:crypto';
import {MonitorError} from '../monitoring';
export function authorizeMonitor(request:Request,kind:'admin'|'cron'){
 const setting=kind==='admin'?'EVOX_ADMIN_SECRET':'CRON_SECRET',expected=process.env[setting];
 if(!expected||expected.length<32||expected.startsWith('YOUR_'))throw new MonitorError('configuration',`${setting} must be configured with at least 32 random characters.`,503);
 const actual=request.headers.get('authorization');
 if(!actual||!timingSafeEqual(createHash('sha256').update(actual).digest(),createHash('sha256').update(`Bearer ${expected}`).digest()))throw new MonitorError('forbidden',`${kind==='admin'?'Admin':'Scheduled job'} authentication required.`,403);
}
export function requireTestMonitoring(){if(process.env.EVOX_ENABLE_MONITOR_TESTS!=='true')throw new MonitorError('test_disabled','Isolated monitoring tests are disabled.',403);}
