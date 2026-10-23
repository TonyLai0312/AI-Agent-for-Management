import {loadEnvConfig} from '@next/env';
import {OpenAIIntegrationError,checkConnection,configuration,createClient,researchWithSources,safeError} from '../lib/server/openai';
loadEnvConfig(process.cwd(),true,{info:()=>{},error:()=>{}});
function reportError(test:string,model:string|null,error:unknown){
 const safe=safeError(error);
 console.error(JSON.stringify({test,ok:false,model,httpStatus:safe.upstreamStatus,type:safe.providerType,code:safe.providerCode??safe.code,message:safe.message,requestId:safe.requestId,credentialSubstitutionSuspected:safe.credentialSubstitutionSuspected}));
 process.exitCode=1;
}
async function main(){
 const config=configuration();const client=createClient();
 // Both endpoints use the exact same client/runtime/credential/project settings.
 try{const {data:models,response}=await client.models.list().withResponse();
  for(const model of [config.model,config.researchModel,config.contactModel,config.matchingModel])if(!models.data.some(candidate=>candidate.id===model))throw new OpenAIIntegrationError('model_access','Configured model is absent from the model list.');
  console.log(JSON.stringify({test:'model-discovery',ok:true,httpStatus:response.status,authenticationVerified:false}));
 }catch(error){reportError('model-discovery',null,error);}
 try{const result=await checkConnection(client);console.log(JSON.stringify({test:'text-generation',ok:true,model:result.model}));}
 catch(error){reportError('text-generation',config.model,error);console.log(JSON.stringify({test:'web-search',status:'not-run',model:config.researchModel,reason:'Text-generation authentication must succeed first.'}));return;}
 try{const result=await researchWithSources('Search for official OpenAI Responses API documentation. Describe it in one sentence with a cited source link.',client);
  console.log(JSON.stringify({test:'web-search',ok:true,model:result.model,sources:result.sources.map(({title,url})=>({title,url}))}));
 }catch(error){reportError('web-search',config.researchModel,error);}
}
void main().catch(error=>reportError('configuration',null,error));
