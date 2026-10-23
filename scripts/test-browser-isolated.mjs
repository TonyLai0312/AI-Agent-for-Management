import {spawn} from 'node:child_process';
import {mkdtemp,rm,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {randomBytes} from 'node:crypto';
await mkdir('work',{recursive:true});const directory=await mkdtemp(resolve('work/isolated-browser-'));
const baseURL='http://127.0.0.1:3117',environment={...process.env,EVOX_DB_PATH:directory,PLAYWRIGHT_BASE_URL:baseURL,EVOX_ENABLE_MONITOR_TESTS:'true',EVOX_ADMIN_SECRET:process.env.EVOX_ADMIN_SECRET||randomBytes(32).toString('hex'),CRON_SECRET:process.env.CRON_SECRET||randomBytes(32).toString('hex')};
const seed=spawn(process.execPath,['--import','tsx','-e',"require('./tests/prospect-browser-seed.ts').seedProspectBrowser().catch(()=>process.exit(1))"],{env:environment,stdio:'inherit'});if(await new Promise(r=>seed.once('exit',r))!==0)throw new Error('Explicit browser fixture seed failed.');
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','3117'],{env:environment,stdio:'ignore'});
try{let ready=false;for(let n=0;n<150;n++){if(server.exitCode!==null)throw new Error('Browser QA server exited.');try{if((await fetch(baseURL+'/api/health')).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,200));}if(!ready)throw new Error('Browser QA server timed out.');const child=spawn(process.execPath,['node_modules/@playwright/test/cli.js','test',...process.argv.slice(2)],{env:environment,stdio:'inherit'});process.exitCode=await new Promise(r=>child.once('exit',code=>r(code??1)));}finally{server.kill('SIGTERM');await new Promise(r=>server.exitCode!==null?r():server.once('exit',r));await rm(directory,{recursive:true,force:true});}
