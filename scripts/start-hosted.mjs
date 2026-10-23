/** Single database-owning app plus an HTTP-only scheduler; fail closed if either child dies. */
import {validPasswordHash} from '../lib/server/password.mjs';
import {spawn} from 'node:child_process';
const env={...process.env,EVOX_AUTH_MODE:'accounts',HOSTNAME:'0.0.0.0'};const port=env.PORT||'3000';
if(!env.EVOX_DB_PATH||!env.GM_EMAIL||!validPasswordHash(env.GM_PASSWORD_HASH)||!env.BDR_EMAIL||!validPasswordHash(env.BDR_PASSWORD_HASH)||!env.CRON_SECRET||env.CRON_SECRET.length<32||!env.EVOX_ADMIN_SECRET||env.EVOX_ADMIN_SECRET.length<32){process.stderr.write('Hosted startup blocked: configure persistent database path, both account hashes, CRON_SECRET and EVOX_ADMIN_SECRET.\n');process.exit(1);}
const app=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','0.0.0.0','--port',port],{env,stdio:'inherit'});let scheduler,stopping=false;
function stop(code=0){if(stopping)return;stopping=true;app.kill('SIGTERM');scheduler?.kill('SIGTERM');process.exitCode=code;}
process.on('SIGTERM',()=>stop());process.on('SIGINT',()=>stop());app.once('exit',code=>stop(code??1));
try{let ready=false;for(let n=0;n<150&&!stopping;n++){try{if((await fetch(`http://127.0.0.1:${port}/api/health`)).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,200));}if(!ready)throw new Error();scheduler=spawn(process.execPath,['scripts/monitor-scheduler.mjs'],{env:{...env,APP_BASE_URL:`http://127.0.0.1:${port}`},stdio:'inherit'});scheduler.once('exit',()=>stop(1));}catch{process.stderr.write('Hosted startup failed.\n');stop(1);}
