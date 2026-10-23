import {loadEnvConfig} from '@next/env';
import {checkConnection,safeError} from '../lib/server/openai';
loadEnvConfig(process.cwd(),true,{info:()=>{},error:()=>{}});
async function main(){try{console.log(JSON.stringify(await checkConnection()))}catch(error){const safe=safeError(error);console.error(JSON.stringify({ok:false,code:safe.code,error:safe.message}));process.exitCode=1}
}
void main();
