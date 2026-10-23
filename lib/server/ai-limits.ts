/** Per-process admission control. Multi-instance deployments need a shared limiter. */
export class RequestLimitError extends Error {}
export function createRequestLimiter(maxPerMinute=60,maxConcurrent=2,now=Date.now){
 let starts:number[]=[],active=0;
 return ()=>{
  const time=now();starts=starts.filter(start=>time-start<60000);
  if(active>=maxConcurrent||starts.length>=maxPerMinute)throw new RequestLimitError('AI request limit reached. Retry later.');
  starts.push(time);active++;
  let released=false;
  return ()=>{if(!released){active--;released=true;}};
 };
}
export const admitRequest=createRequestLimiter();
