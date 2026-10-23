// The configured secret is unchanged. Only the child server gets an empty key.
import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
const directory=await mkdtemp(resolve('work/missing-key-'));
const port=3113;
const baseURL=`http://127.0.0.1:${port}`;
const childEnvironment={...process.env,OPENAI_API_KEY:'',EVOX_DB_PATH:directory};
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',String(port)],{env:childEnvironment,stdio:'ignore'});
try{
 let ready=false;
 for(let attempt=0;attempt<100;attempt++){
  if(server.exitCode!==null)throw new Error('Isolated missing-key server failed to start.');
  try{const response=await fetch(`${baseURL}/api/openai`);const config=await response.json();if(config.configured)throw new Error('Isolated server unexpectedly has a configured key.');if(response.ok){ready=true;break;}}catch(error){if(error.message?.includes('unexpectedly'))throw error;}
  await new Promise(resolve=>setTimeout(resolve,200));
 }
 if(!ready)throw new Error('Isolated server startup timed out.');
 const test=spawn(process.execPath,['node_modules/@playwright/test/cli.js','test','--grep','OpenAI configuration is credential-free'],{env:{...childEnvironment,PLAYWRIGHT_BASE_URL:baseURL},stdio:'inherit'});
 process.exitCode=await new Promise(resolve=>test.on('exit',code=>resolve(code??1)));
}finally{
 server.kill('SIGTERM');
 await new Promise(resolve=>{if(server.exitCode!==null)resolve();else server.once('exit',resolve);});
 await rm(directory,{recursive:true,force:true});
}
