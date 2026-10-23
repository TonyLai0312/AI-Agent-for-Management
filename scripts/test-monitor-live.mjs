/** Explicitly authorized internal Gmail test. Uses isolated records and a persistent QA ledger; never prospects. */
import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {randomBytes} from 'node:crypto';
const directory=resolve('work/gmail-monitor-live');await mkdir(directory,{recursive:true});
const base='http://127.0.0.1:3123';
const environment={...process.env,EVOX_DB_PATH:resolve(directory,'pg'),EVOX_ENABLE_MONITOR_TESTS:'true',EVOX_ADMIN_SECRET:process.env.EVOX_ADMIN_SECRET||randomBytes(32).toString('hex'),CRON_SECRET:process.env.CRON_SECRET||randomBytes(32).toString('hex')};
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','3123'],{env:environment,stdio:'ignore'});
const headers={Authorization:`Bearer ${environment.EVOX_ADMIN_SECRET}`,'Content-Type':'application/json'};
let retained;
async function request(action){const response=await fetch(base+'/api/monitoring/admin?namespace=test',{method:action?'POST':'GET',headers,body:action?JSON.stringify({...action,namespace:'test'}):undefined});const data=await response.json();if(!response.ok)throw new Error(typeof data.code==='string'?data.code:'admin_request_failed');return data;}
try{
 let ready=false;for(let n=0;n<150;n++){if(server.exitCode!==null)throw new Error('test_server_exited');try{const response=await fetch(base+'/api/health');if(response.ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,200));}if(!ready)throw new Error('test_server_timeout');
 let state=await request();let invitation=state.invitations[0];
 if(!invitation){state=await request({action:'seed',sentAt:'2026-10-16T02:00:00Z'});invitation=state.invitations[0];await request({action:'clock',now:new Date(Date.parse(invitation.dueAt)-1).toISOString()});const before=await request({action:'run'});if(before.alerts.length)throw new Error('premature_alert');}
 let alert=state.alerts.find(a=>a.send_id===invitation.id);
 if(!alert||!['provider-accepted','resolved'].includes(alert.state)){
  if(alert?.state==='failed')await request({action:'retry',sendId:invitation.id});
  state=await request();if(Date.parse(state.now)<Date.parse(invitation.dueAt))await request({action:'clock',now:invitation.dueAt});
  state=await request({action:'run'});alert=state.alerts.find(a=>a.send_id===invitation.id);
 }
 if(alert?.state==='provider-accepted'){
  state=await request({action:'evidence',sendId:invitation.id});alert=state.alerts.find(a=>a.send_id===invitation.id);
  if(!alert.provider_id||!alert.evidence.some(e=>e.realProvider&&e.operation==='retrieve'&&e.labels?.includes('SENT')))throw new Error('provider_evidence_unconfirmed');
  state=await request({action:'status',sendId:invitation.id,status:'checked/pending'});const after=await request({action:'run'});if(after.alerts.filter(a=>a.send_id===invitation.id).length!==1||after.alerts.find(a=>a.send_id===invitation.id)?.state!=='resolved')throw new Error('late_update_not_resolved');state=after;alert=state.alerts.find(a=>a.send_id===invitation.id);
 }
 const success=alert?.state==='resolved'&&!!alert.provider_id&&alert.evidence.some(e=>e.realProvider&&e.operation==='retrieve'&&e.labels?.includes('SENT'));
 retained={test:'gmail-overdue-flow',ok:success,provider:'gmail',namespace:'test',sendId:invitation.id,state:alert?.state??'not_queued',providerId:alert?.provider_id??null,code:alert?.error_code??null,message:alert?.error_message??null,deliveryConfirmed:false,evidence:alert?.evidence??[],checkedAt:new Date().toISOString()};
 await writeFile(resolve(directory,'provider-evidence.json'),JSON.stringify(retained,null,2));process.stdout.write(JSON.stringify(retained)+'\n');if(!success)process.exitCode=1;
}catch(error){retained={test:'gmail-overdue-flow',ok:false,code:['admin_request_failed','test_server_exited','test_server_timeout','premature_alert','provider_evidence_unconfirmed','late_update_not_resolved','configuration','forbidden'].includes(error.message)?error.message:'test_failed',deliveryConfirmed:false};await writeFile(resolve(directory,'last-run-error.json'),JSON.stringify(retained,null,2));process.stdout.write(JSON.stringify(retained)+'\n');process.exitCode=1;
}finally{server.kill('SIGTERM');await new Promise(r=>server.exitCode!==null?r():server.once('exit',r));}
