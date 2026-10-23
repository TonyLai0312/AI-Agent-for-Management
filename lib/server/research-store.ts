import {randomUUID} from 'node:crypto';
import {db,serial} from '../demo-db';
import {allReportSources,initialResearchProfile,qualifyReport,type ResearchProfile,type ResearchReport} from '../market-research';
import {OpenAIIntegrationError,safeError} from './openai';
import {runMarketResearch} from './market-research';
export type ResearchJob={id:string;status:'running'|'completed'|'failed';phase:string;message:string;startedAt:string;updatedAt:string;profile:ResearchProfile;error:{code:string;message:string;requestId:string|null;httpStatus?:number|null}|null};
export type ResearchWorkspace={version:number;profile:ResearchProfile;job:ResearchJob|null;report:ResearchReport|null;reportHistory?:ResearchReport[];history:ResearchJob[];reviews:{evidenceId:string;status:string;note:string;at:string;actor:string}[]};
const globals=globalThis as unknown as {evoxResearchRuns?:Set<string>};
const running=globals.evoxResearchRuns??=new Set();
async function load(){const pg=await db();await pg.exec('CREATE TABLE IF NOT EXISTS research_workspaces(id text PRIMARY KEY,data jsonb NOT NULL)');
 const rows=await pg.query<{data:ResearchWorkspace}>('SELECT data FROM research_workspaces WHERE id=$1',['evox-live-market']);
 return rows.rows[0]?.data??{version:1,profile:initialResearchProfile(),job:null,report:null,reportHistory:[],history:[],reviews:[]};
}
async function save(workspace:ResearchWorkspace){const pg=await db();await pg.query('INSERT INTO research_workspaces(id,data) VALUES($1,$2) ON CONFLICT(id) DO UPDATE SET data=excluded.data',['evox-live-market',JSON.stringify(workspace)]);}
function view(w:ResearchWorkspace){return {...w,qualification:w.report?qualifyReport(w.report,w.profile):null,profileChangedSinceResearch:!!w.report&&JSON.stringify(w.profile)!==JSON.stringify(w.report.profile)};}
function stale(w:ResearchWorkspace){if(w.job?.status==='running'&&(!running.has(w.job.id)||Date.now()-Date.parse(w.job.updatedAt)>8*60000)){w.job.status='failed';w.job.phase='failed';w.job.message='Research was interrupted. Retry to start a new live request.';w.job.error={code:'interrupted',message:w.job.message,requestId:null};w.version++;return true;}return false;}
/** Caller must hold the shared serial lock. Used to validate downstream selections atomically. */
export async function researchWorkspaceLocked(){const w=await load();if(stale(w))await save(w);return view(w);}
export async function researchWorkspace(){return serial(researchWorkspaceLocked);}
function available(w:ResearchWorkspace,version:number){stale(w);if(w.version!==version)throw new OpenAIIntegrationError('workspace_changed','Research workspace changed. Refresh and retry.',409);if(w.job?.status==='running')throw new OpenAIIntegrationError('research_running','Research is already running. Wait for the current attempt.',409);}
export async function updateResearchProfile(profile:ResearchProfile,version:number){return serial(async()=>{const w=await load();available(w,version);w.profile=profile;w.version++;await save(w);return view(w);});}
export async function reviewResearchEvidence(input:{version:number;evidenceId:string;status:'verified'|'rejected'|'unverified';note:string},actor:string){return serial(async()=>{
 const w=await load();available(w,input.version);if(!w.report)throw new OpenAIIntegrationError('not_found','No research report exists.',404);
 const evidence=allReportSources(w.report).find(s=>s.id===input.evidenceId);if(!evidence)throw new OpenAIIntegrationError('not_found','Evidence was not found in the current report.',404);
 evidence.status=input.status;evidence.reviewedAt=new Date().toISOString();evidence.reviewedBy=actor;evidence.reviewNote=input.note;
 w.reviews.push({evidenceId:evidence.id,status:input.status,note:input.note,at:evidence.reviewedAt,actor});w.version++;await save(w);return view(w);
});}
export async function startResearch(version:number,execute:typeof runMarketResearch=runMarketResearch){
 const job=await serial(async()=>{const w=await load();available(w,version);if(w.job)w.history.push(w.job);const time=new Date().toISOString();w.job={id:randomUUID(),status:'running',phase:'queued',message:'Preparing live research.',startedAt:time,updatedAt:time,profile:structuredClone(w.profile),error:null};running.add(w.job.id);w.version++;await save(w);return structuredClone(w.job);});
 try{
  const report=await execute(job.profile,async(phase,message)=>{await serial(async()=>{const w=await load();if(w.job?.id!==job.id||w.job.status!=='running')throw new OpenAIIntegrationError('interrupted','The research attempt is no longer active.',409);w.job.phase=phase;w.job.message=message;w.job.updatedAt=new Date().toISOString();w.version++;await save(w);});});
  return await serial(async()=>{const w=await load();if(w.job?.id!==job.id||w.job.status!=='running')throw new OpenAIIntegrationError('interrupted','The research attempt is no longer active.',409);if(w.report)(w.reportHistory??=[]).push(w.report);w.report=report;w.job.status='completed';w.job.phase='completed';w.job.message=`Research completed: ${report.companies.length} source-backed candidates pending evidence review.`;w.job.updatedAt=new Date().toISOString();w.version++;await save(w);return view(w);});
 }catch(error){const safe=safeError(error);return await serial(async()=>{const w=await load();if(w.job?.id===job.id){w.job.status='failed';w.job.phase='failed';w.job.message=safe.message;w.job.error={code:safe.providerCode??safe.code,message:safe.message,requestId:safe.requestId,httpStatus:safe.upstreamStatus};w.job.updatedAt=new Date().toISOString();w.version++;await save(w);}return view(w);});}
 finally{running.delete(job.id);}
}
