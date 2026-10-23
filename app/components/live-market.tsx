'use client';
import {useCallback,useEffect,useState,type FormEvent} from 'react';
import type {Role} from '@/lib/demo-types';
import type {ResearchProfile,Source,Qualification} from '@/lib/market-research';
import type {ResearchWorkspace} from '@/lib/server/research-store';
type Workspace=ResearchWorkspace&{qualification:{eligible:Qualification[];additionalEligible:number;needsVerification:Qualification[];ineligible:Qualification[];excluded:Qualification[];duplicatesRemoved:number}|null;profileChangedSinceResearch:boolean};
const split=(value:string)=>value.split(',').map(v=>v.trim()).filter(Boolean);
const date=(value:string)=>new Date(value).toLocaleString('en-SG',{timeZone:'Asia/Singapore'});
export default function LiveMarket({mode,role}:{mode:'profile'|'research';role:Role|null}){
 const [workspace,setWorkspace]=useState<Workspace|null>(null),[working,setWorking]=useState(false),[requestAction,setRequestAction]=useState(''),[error,setError]=useState('');
 const refresh=useCallback(async()=>{const response=await fetch('/api/research',{cache:'no-store'});const data=await response.json();if(!response.ok)throw new Error(data.error||'Research workspace unavailable.');setWorkspace(previous=>!previous||data.version>=previous.version?data:previous);},[]);
 useEffect(()=>{void refresh().catch(e=>setError(e.message));},[refresh]);
 useEffect(()=>{if(workspace?.job?.status!=='running'&&requestAction!=='run')return;const timer=setInterval(()=>{void refresh().catch(e=>setError(e.message));},1200);return()=>clearInterval(timer);},[workspace?.job?.status,requestAction,refresh]);
 async function mutate(input:Record<string,unknown>){if(!workspace)return;setWorking(true);setRequestAction(String(input.action));setError('');try{
  const response=await fetch('/api/research',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...input,version:workspace.version})});const data=await response.json();
  if(data.profile)setWorkspace(data);if(!response.ok){if(response.status===409)await refresh();throw new Error(data.error||data.job?.error?.message||'Live research failed.');}
 }catch(e){setError((e as Error).message);await refresh().catch(()=>{});}finally{setWorking(false);setRequestAction('');}}
 if(!workspace)return <section className="panel live-research" aria-label="Live market research"><div className="detail-body"><h2>Live market research</h2><p>{error||'Loading saved research…'}</p><button className="secondary" onClick={()=>refresh().catch(e=>setError(e.message))}>Retry loading research</button></div></section>;
 const running=workspace.job?.status==='running',disabled=working||running;
 const review=(source:Source,status:Source['status'],note:string)=>mutate({action:'review',evidenceId:source.id,status,note,confirmed:true});
 const renderEvidence=(source:Source)=><EvidenceCard key={source.id} source={source} disabled={disabled||!role} onReview={review}/>;
 function saveProfile(event:FormEvent<HTMLFormElement>){event.preventDefault();const data=Object.fromEntries(new FormData(event.currentTarget)) as Record<string,string>;
  const profile:ResearchProfile={countries:split(data.countries),industries:split(data.industries),minimumEmployees:Number(data.minimumEmployees),minimumRevenueUSD:Number(data.minimumRevenueUSD)*1000000,start:data.start,end:data.end,technologyPreferences:split(data.technologyPreferences),exclusions:split(data.exclusions)};void mutate({action:'profile',profile});
 }
 const job=workspace.job,report=workspace.report,q=workspace.qualification;
 return <section className="panel live-research" aria-label={mode==='profile'?'Live research profile':'Live market research'}>
 <div className="panel-heading"><div><h2>{mode==='profile'?'Live research target profile':'Live market research and qualification'}</h2><p>Public-source research · source review required · no automated outreach</p></div><span className="pill">LIVE RESEARCH</span></div>
 {error&&<div className="live-error" role="alert">{error}</div>}
 {mode==='profile'?<form key={JSON.stringify(workspace.profile)} className="detail-body" onSubmit={saveProfile}>
 <fieldset disabled={disabled||role!=='GM'}><legend>Mandatory company criteria</legend><p>All mandatory facts need verified supporting sources before a company is eligible.</p><div className="settings-grid">
 <label>Live target countries<input name="countries" defaultValue={workspace.profile.countries.join(', ')} required/></label>
 <label>Live target industries<input name="industries" defaultValue={workspace.profile.industries.join(', ')} required/></label>
 <label>Live minimum employees<input name="minimumEmployees" type="number" min="1" defaultValue={workspace.profile.minimumEmployees} required/></label>
 <label>Live minimum annual revenue (USD millions)<input name="minimumRevenueUSD" type="number" min="0.001" step="any" defaultValue={workspace.profile.minimumRevenueUSD/1000000} required/></label></div></fieldset>
 <fieldset disabled={disabled||role!=='GM'}><legend>Preferences and research scope</legend><p>Recent buying signals and technology affect fit score; their absence does not disqualify a company. Financial evidence can predate the buying-signal window.</p><div className="settings-grid">
 <label>Live buying-signal start<input name="start" type="date" defaultValue={workspace.profile.start} required/></label>
 <label>Live buying-signal end<input name="end" type="date" defaultValue={workspace.profile.end} required/></label>
 <label>Live technology preferences<input name="technologyPreferences" defaultValue={workspace.profile.technologyPreferences.join(', ')}/></label>
 <label>Live campaign exclusions<input name="exclusions" defaultValue={workspace.profile.exclusions.join(', ')} placeholder="Company, alias, domain or industry keywords"/></label></div>
 <p>Dates are editable; the initial window covers 30 calendar dates through today in Singapore.</p><button className="primary" disabled={disabled||role!=='GM'}>Save live research profile</button></fieldset></form>:<>
 <div className="detail-body"><p><strong>Mandatory:</strong> {workspace.profile.countries.join(', ')} · {workspace.profile.industries.join(', ')} · {workspace.profile.minimumEmployees.toLocaleString()}+ staff · USD {(workspace.profile.minimumRevenueUSD/1000000).toLocaleString()}m+ annual revenue.</p>
 <p><strong>Preferences:</strong> buying signals {workspace.profile.start}–{workspace.profile.end}; {workspace.profile.technologyPreferences.join(', ')||'no technology preference'}. Edit these in GM Target Profile.</p>
 <p><strong>Exclusions:</strong> {workspace.profile.exclusions.join(', ')||'None'}</p>
 <button className="primary" disabled={disabled||role!=='GM'} onClick={()=>void mutate({action:'run'})}>{running||requestAction==='run'?'Research in progress…':job?.status==='failed'?'Retry live research':'Run live market research'}</button>
 {!role&&<p>Choose a demo identity to use this restricted prototype. GM starts research; GM or BDR reviews sources.</p>}
 {requestAction==='run'&&!running&&<p aria-live="polite">Starting a new live research attempt…</p>}{job&&<div className={job.status==='failed'?'research-progress live-error':'research-progress'} aria-live="polite" aria-busy={running}>
 <strong>{job.status==='failed'?'Live research failed':job.status==='completed'?'Research completed':`Research progress: ${job.phase}`}</strong><p>{job.message}</p>
 {running&&<progress aria-label="Live research progress" max="4" value={{queued:0,searching:1,extracting:2,qualifying:3}[job.phase]??0}/>}
 <small>Started {date(job.startedAt)} · Updated {date(job.updatedAt)}</small>
 {job.error&&<p>Code: {job.error.code}{job.error.httpStatus?` · Provider HTTP ${job.error.httpStatus}`:''}{job.error.requestId?` · Request ID: ${job.error.requestId}`:''}. No fixture results were substituted.</p>}
 </div>}
 </div>
 {!report&&<div className="empty">No successful live research report yet. Run research to discover companies; live failures appear above.</div>}
 {report&&q&&<><div className="detail-body">
 <h3>{job?.status==='failed'?'Previous successful report — latest attempt failed':'Saved live research report'}</h3><p>Retrieved {date(report.retrievedAt)} · Model {report.model}. {q.duplicatesRemoved} duplicate records combined; all source passages retained.</p>
 {workspace.profileChangedSinceResearch&&<div className="warning">Profile changed since this report. Qualification below uses the current criteria, but the report was researched for its original scope. Run research again to discover newly relevant companies.</div>}
 <details><summary>Report scope and limitations</summary><p>Original countries: {report.profile.countries.join(', ')}. Original industries: {report.profile.industries.join(', ')}. Signal dates: {report.profile.start}–{report.profile.end}.</p><ul>{report.limitations.map((value,i)=><li key={i}>{value}</li>)}</ul><p>Discovery is not exhaustive. Sources and extracted passages require review; a model citation does not verify a fact.</p></details>
 <h3>Market-level trends</h3><p>These trends do not establish a buying need or a mandatory fact for any company.</p>
 {!report.trends.length&&<p>No supported market trends returned.</p>}{report.trends.map((trend,i)=><article className="evidence-card" key={i}><p>{trend.claim}</p>{trend.evidence.map(renderEvidence)}</article>)}
 <h3>Eligible company shortlist ({q.eligible.length}/10)</h3><p>Industry 30% · scale/complexity 20% · recent signals 25% · technology evidence 15% · geography 10%. Evidence confidence is independent of fit score.</p>
 {!q.eligible.length&&<p>No companies currently satisfy all mandatory source-verification gates. The shortlist is not padded.</p>}
 {q.eligible.map(company=><CompanyCard key={company.id} company={company} renderEvidence={renderEvidence}/>)}
 {q.additionalEligible>0&&<p>{q.additionalEligible} additional eligible companies fall below the top ten.</p>}
 <h3>Needs Verification ({q.needsVerification.length})</h3><p>Unknown, unreviewed or conflicting mandatory facts cannot be ranked. Open each company’s evidence and verify or reject passages after checking the source.</p>
 {q.needsVerification.map(company=><CompanyCard key={company.id} company={company} renderEvidence={renderEvidence}/>)}
 <details><summary>Ineligible ({q.ineligible.length}) and campaign exclusions ({q.excluded.length})</summary>{[...q.ineligible,...q.excluded].map(company=><CompanyCard key={company.id} company={company} renderEvidence={renderEvidence}/>)}</details>
 {(workspace.reportHistory?.length??0)>0&&<details><summary>Earlier successful reports ({workspace.reportHistory!.length})</summary><p>Earlier sources, passages, financial years and review decisions are retained. Download a report to inspect its full evidence.</p>{workspace.reportHistory!.map(previous=><div className="history-row" key={previous.id}><p>{date(previous.retrievedAt)} · {previous.companies.length} candidate records · {previous.model}</p><button className="secondary" onClick={()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(previous,null,2)],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download=`evox-research-${previous.id}.json`;link.click();URL.revokeObjectURL(url);}}>Download archived report</button></div>)}</details>}
 <details><summary>Scoring and confidence rules</summary><p>Industry and geography receive their full weights after passing mandatory gates. Scale gives up to 10 points for staff at twice the minimum, 5 for revenue at twice the minimum, and 5 for sourced multi-entity/site complexity. A verified signal in the final 7 days earns 25; 8–14 days earns 20; older in-window signals earn 15. Verified preferred technology earns 15. Other preferences receive zero when evidence is absent.</p><p>Confidence is verified field coverage out of eight: identity, country, industry, employees, annual revenue with currency/year/conversion, an in-window signal, technology and complexity. It measures review coverage, not statistical truth. Only eligible companies get fit scores.</p></details>
 </div></>}
 </>}
 </section>;
}
function EvidenceCard({source,disabled,onReview}:{source:Source;disabled:boolean;onReview:(source:Source,status:Source['status'],note:string)=>Promise<void>}){
 const [note,setNote]=useState(''),[confirmed,setConfirmed]=useState(false);
 return <details className="source-evidence"><summary>{source.title} · {source.status}</summary>
 <p><a href={source.url} target="_blank" rel="noopener noreferrer">{source.url}</a></p><blockquote>{source.passage}</blockquote>
 <p>Published: {source.publicationDate??'Unknown'} · Retrieved: {date(source.retrievedAt)} · Verification: {source.status}</p>
 {source.reviewedAt&&<p>Reviewed {date(source.reviewedAt)} by {source.reviewedBy}: {source.reviewNote}</p>}
 <label>Source review note<textarea aria-label={`Source review note ${source.id}`} value={note} onChange={e=>setNote(e.target.value)} disabled={disabled} placeholder="Record what the source supports, conflicts with or does not establish."/></label>
 <label className="check"><input type="checkbox" checked={confirmed} disabled={disabled} onChange={e=>setConfirmed(e.target.checked)}/>I checked this exact passage, company/entity, figure/date and claim against the linked source.</label>
 <div className="button-row">{(['verified','rejected','unverified'] as const).map(status=><button key={status} className="secondary" disabled={disabled||!confirmed||note.trim().length<10} onClick={()=>void onReview(source,status,note)}>{status==='verified'?'Verify this claim':status==='rejected'?'Reject this claim':'Mark unresolved'}</button>)}</div></details>;
}
function CompanyCard({company,renderEvidence}:{company:Qualification;renderEvidence:(source:Source)=>React.ReactNode}){
 return <article className="evidence-card live-company" data-testid={`live-company-${company.id}`}><h4>{company.name} <span className="pill">{company.status}</span></h4>
 <p>{company.country??'Country unknown'} · {company.industry??'Industry unknown'} · {company.employees?.toLocaleString()??'Unknown'} employees · {company.revenueUSD===null?'USD revenue unknown':`USD ${company.revenueUSD.toLocaleString()} annual revenue`}</p>
 <p><strong>Fit score:</strong> {company.score===null?'Not ranked':`${company.score}/100`} · <strong>Evidence confidence:</strong> {company.confidence}% verified field coverage ({company.verifiedFields}/{company.totalFields})</p>
 {company.breakdown&&<p>Industry {company.breakdown.industry}/30 · Scale {company.breakdown.scale}/20 · Signals {company.breakdown.signals}/25 · Technology {company.breakdown.technology}/15 · Geography {company.breakdown.geography}/10</p>}
 <ul>{company.reasons.map((reason,i)=><li key={i}>{reason}</li>)}</ul>
 <details><summary>Company-specific evidence ({company.records.length} source record{company.records.length===1?'':'s'})</summary>{company.records.map(record=><div key={record.id}>
 <h4>{record.name}{record.aliases.length?` · Aliases: ${record.aliases.join(', ')}`:''}</h4>
 <Claim label="Identity" value={record.name} evidence={record.identityEvidence} render={renderEvidence}/>
 <Claim label="Country" value={record.country.value} evidence={record.country.evidence} render={renderEvidence}/>
 <Claim label="Industry" value={record.industry.value} evidence={record.industry.evidence} render={renderEvidence}/>
 <Claim label="Employees" value={record.employees.value} evidence={record.employees.evidence} render={renderEvidence}/>
 <Claim label="Annual revenue — original reported figure" value={record.revenue.amount===null?'Unknown':`${record.revenue.currency??'Unknown currency'} ${record.revenue.amount.toLocaleString()} · Reporting year ${record.revenue.reportingYear??'unknown'} · ${record.revenue.period}`} evidence={record.revenue.evidence} render={renderEvidence}/>
 <Claim label="USD conversion" value={record.revenue.currency==='USD'?'Reported in USD':record.revenue.fxRateToUSD?`${record.revenue.fxRateToUSD} USD per ${record.revenue.currency} · FX date ${record.revenue.fxDate??'unknown'}`:'Unknown — no assumed conversion'} evidence={record.revenue.fxEvidence} render={renderEvidence}/>
 <Claim label="Technology" value={record.technology.value} evidence={record.technology.evidence} render={renderEvidence}/>
 <Claim label="Multi-entity/site complexity" value={record.complexity.value===null?null:String(record.complexity.value)} evidence={record.complexity.evidence} render={renderEvidence}/>
 <h4>Company buying signals</h4>{!record.signals.length&&<p>No evidenced signals returned.</p>}{record.signals.map((signal,i)=><Claim key={i} label={`Signal date ${signal.date??'unknown'}`} value={signal.description} evidence={signal.evidence} render={renderEvidence}/>)}</div>)}</details></article>;
}
function Claim({label,value,evidence,render}:{label:string;value:string|number|null;evidence:Source[];render:(source:Source)=>React.ReactNode}){return <div className="material-claim"><strong>{label}:</strong> {value??'Unknown'}{!evidence.length?<p>No supporting source — unresolved.</p>:evidence.map(render)}</div>;}
