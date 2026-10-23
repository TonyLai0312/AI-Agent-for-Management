/** Same-client diagnostic. Reports only safe metadata; never headers or credential fragments. */
import {loadEnvConfig} from '@next/env';
import {EnvHttpProxyAgent,fetch} from 'undici';
import {createClient,configuration,safeError} from '../lib/server/openai';
loadEnvConfig(process.cwd(),true,{info:()=>{},error:()=>{}});
async function main(){
 const client=createClient();
 console.log(JSON.stringify({runtime:process.version,sameClient:true,credentialSource:'process.env.OPENAI_API_KEY',baseURL:client.baseURL,organizationConfigured:!!client.organization,projectConfigured:!!client.project}));
 const models=await client.models.list().withResponse();
 console.log(JSON.stringify({test:'models',status:models.response.status,authenticationVerified:false}));
 // This unauthenticated control does not change or replace the environment credential.
 const agent=new EnvHttpProxyAgent();
 try{const control=await fetch('https://api.openai.com/v1/models',{dispatcher:agent,signal:AbortSignal.timeout(30000)});
  console.log(JSON.stringify({test:'models-without-authorization',status:control.status}));await control.body?.cancel();
 }finally{await agent.close();}
 try{const result=await client.responses.create({model:configuration().model,store:false,input:'Reply with exactly OK.',max_output_tokens:32}).withResponse();
  console.log(JSON.stringify({test:'responses',status:result.response.status,model:result.data.model,completed:result.data.status==='completed'}));
 }catch(error){const safe=safeError(error);console.log(JSON.stringify({test:'responses',status:safe.upstreamStatus,type:safe.providerType,code:safe.providerCode,message:safe.message,requestId:safe.requestId,credentialSubstitutionSuspected:safe.credentialSubstitutionSuspected}));process.exitCode=1;}
}
main().catch(error=>{const safe=safeError(error);console.error(JSON.stringify({code:safe.code,message:safe.message}));process.exitCode=1;});
