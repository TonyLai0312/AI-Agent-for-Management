import {z} from 'zod';
const label=z.string().trim().min(1).max(180);
const date=z.iso.date();
export const researchProfileSchema=z.object({
 countries:z.array(label).min(1).max(20),industries:z.array(label).min(1).max(12),
 minimumEmployees:z.number().int().min(1).max(10000000),minimumRevenueUSD:z.number().min(1).max(1e15),
 start:date,end:date,technologyPreferences:z.array(label).max(20),exclusions:z.array(label).max(100),
}).strict().refine(p=>p.start<=p.end,'Research start must not exceed end');
export type ResearchProfile=z.infer<typeof researchProfileSchema>;
export function initialResearchProfile(now=new Date()):ResearchProfile{
 const end=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Singapore',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
 const start=new Date(Date.parse(end+'T00:00:00Z')-29*86400000).toISOString().slice(0,10);
 return {countries:['Indonesia','Thailand','Vietnam','Malaysia','Philippines'],industries:['Food & Beverage Manufacturing','Retail'],minimumEmployees:300,minimumRevenueUSD:200000000,start,end,
 technologyPreferences:['SAP ERP','Oracle ERP','Legacy planning tools','Spreadsheet-based processes'],exclusions:[]};
}
const excerpt=z.string().min(1).max(700);
export const sourceSchema=z.object({url:z.string().url(),title:label,passage:excerpt,publicationDate:date.nullable()}).strict();
export type Source=z.infer<typeof sourceSchema>&{id:string;retrievedAt:string;status:'unverified'|'verified'|'rejected';reviewedAt:string|null;reviewedBy:string|null;reviewNote:string};
const fact=<T extends z.ZodType>(value:T)=>z.object({value:value.nullable(),evidence:z.array(sourceSchema).max(4)}).strict();
export const researchExtractionSchema=z.object({
 trends:z.array(z.object({claim:excerpt,evidence:z.array(sourceSchema).min(1).max(4)}).strict()).max(5),
 companies:z.array(z.object({name:label,aliases:z.array(label).max(8),domain:z.string().nullable(),registrationId:label.nullable(),identityEvidence:z.array(sourceSchema).min(1).max(4),
 country:fact(label),industry:fact(label),employees:fact(z.number().int().nonnegative()),
 revenue:z.object({amount:z.number().nonnegative().nullable(),currency:z.string().regex(/^[A-Z]{3}$/).nullable(),reportingYear:z.number().int().min(1900).max(2100).nullable(),period:z.enum(['annual','quarterly','unknown']),evidence:z.array(sourceSchema).max(4),fxRateToUSD:z.number().positive().nullable(),fxDate:date.nullable(),fxEvidence:z.array(sourceSchema).max(4)}).strict(),
 signals:z.array(z.object({description:excerpt,date:date.nullable(),evidence:z.array(sourceSchema).min(1).max(4)}).strict()).max(5),
 technology:fact(label),complexity:fact(z.boolean()),
 }).strict()).max(10),
 limitations:z.array(excerpt).max(12),
}).strict();
type Raw=z.infer<typeof researchExtractionSchema>;
export type Fact<T>={value:T|null;evidence:Source[]};
export type ResearchCompany=Omit<Raw['companies'][number],'identityEvidence'|'country'|'industry'|'employees'|'revenue'|'signals'|'technology'|'complexity'>&{
 id:string;identityEvidence:Source[];country:Fact<string>;industry:Fact<string>;employees:Fact<number>;
 revenue:Omit<Raw['companies'][number]['revenue'],'evidence'|'fxEvidence'>&{evidence:Source[];fxEvidence:Source[]};
 signals:{description:string;date:string|null;evidence:Source[]}[];technology:Fact<string>;complexity:Fact<boolean>;
};
export type ResearchReport={id:string;retrievedAt:string;model:string;responseIds:string[];profile:ResearchProfile;trends:{claim:string;evidence:Source[]}[];companies:ResearchCompany[];limitations:string[]};
export type Qualification={id:string;name:string;records:ResearchCompany[];status:'Eligible'|'Needs Verification'|'Ineligible'|'Excluded';reasons:string[];country:string|null;industry:string|null;employees:number|null;revenueUSD:number|null;score:number|null;breakdown:{industry:number;scale:number;signals:number;technology:number;geography:number}|null;confidence:number;verifiedFields:number;totalFields:number};
const normalized=(v:string)=>v.normalize('NFKC').toLowerCase().replace(/&/g,'and').replace(/[^\p{L}\p{N}]/gu,'');
const companyName=(v:string)=>normalized(v.replace(/\b(?:co|company|limited|ltd|inc|incorporated|corporation|corp|plc|pt|tbk|sdn|bhd)\b/gi,''));
const live=(source:Source)=>source.status!=='rejected';
const verified=(evidence:Source[])=>evidence.some(s=>s.status==='verified');
export function allCompanySources(c:ResearchCompany):Source[]{return [...c.identityEvidence,...c.country.evidence,...c.industry.evidence,...c.employees.evidence,...c.revenue.evidence,...c.revenue.fxEvidence,...c.signals.flatMap(s=>s.evidence),...c.technology.evidence,...c.complexity.evidence];}
export function allReportSources(report:ResearchReport):Source[]{return [...report.trends.flatMap(t=>t.evidence),...report.companies.flatMap(allCompanySources)];}
function valueOf<T>(facts:Fact<T>[],field:string,reasons:string[]):T|null{
 const supported=facts.filter(f=>f.value!==null&&f.evidence.some(live));
 const values=new Set(supported.map(f=>JSON.stringify(f.value)));
 if(values.size>1){reasons.push(`Conflicting ${field} evidence; review or reject the conflicting source.`);return null;}
 const found=supported.find(f=>verified(f.evidence));
 if(!found){reasons.push(`${field} needs source verification.`);return null;}
 return found.value;
}
function revenueOf(records:ResearchCompany[],reasons:string[]):number|null{
 const amounts:Fact<number>[]=[];
 const years=records.filter(c=>c.revenue.amount!==null&&c.revenue.evidence.some(live)).map(c=>c.revenue.reportingYear).filter((y):y is number=>y!==null);
 const latest=years.length?Math.max(...years):null;
 for(const c of records){const r=c.revenue;if(latest!==null&&r.reportingYear!==latest)continue;
  if(r.amount===null||!r.currency||r.reportingYear===null||r.period!=='annual'||!verified(r.evidence))continue;
  if(r.currency==='USD')amounts.push({value:r.amount,evidence:r.evidence});
  else if(r.fxRateToUSD&&r.fxDate&&verified(r.fxEvidence))amounts.push({value:Math.round(r.amount*r.fxRateToUSD*100)/100,evidence:r.evidence});
 }
 if(!amounts.length){reasons.push('Annual revenue needs a verified annual amount, currency, reporting year and, for non-USD figures, a dated sourced USD conversion.');return null;}
 // Conflicting financial figures for the same latest year cannot silently win by source order.
 const known=records.filter(c=>c.revenue.reportingYear===latest&&c.revenue.evidence.some(live));
 for(const c of known){const r=c.revenue;const rate=r.currency==='USD'?1:r.fxRateToUSD;
  if(r.amount!==null&&rate&&amounts.some(a=>Math.abs(a.value!-r.amount!*rate)>Math.max(1,a.value!*.01))){reasons.push('Conflicting annual revenue for the latest reporting year.');return null;}
 }
 return valueOf(amounts,'annual revenue',reasons);
}
function groups(companies:ResearchCompany[]){
 const result:ResearchCompany[][]=[];
 for(const c of companies){
  const names=new Set([c.name,...c.aliases].map(companyName));
  const matching=result.filter(group=>group.some(other=>{
   // Distinct jurisdictions/registration numbers are separate legal entities.
   if(c.country.value&&other.country.value&&normalized(c.country.value)!==normalized(other.country.value))return false;
   if(c.registrationId&&other.registrationId&&normalized(c.registrationId)!==normalized(other.registrationId))return false;
   const alias=[other.name,...other.aliases].some(n=>names.has(companyName(n)));
   const registration=!!c.registrationId&&normalized(c.registrationId)===normalized(other.registrationId??'');
   return alias||registration;
  }));
  if(!matching.length)result.push([c]);else{matching[0].push(c);for(const extra of matching.slice(1)){matching[0].push(...extra);result.splice(result.indexOf(extra),1);}}
 }
 return result;
}
export function qualifyReport(report:ResearchReport,profile:ResearchProfile){
 const qualified=groups(report.companies).map((records):Qualification=>{
  const reasons:string[]=[];const first=records[0];
  const identity=records.some(c=>verified(c.identityEvidence));if(!identity)reasons.push('Company identity needs source verification.');
  const country=valueOf(records.map(c=>c.country),'Country',reasons),industry=valueOf(records.map(c=>c.industry),'Industry',reasons),employees=valueOf(records.map(c=>c.employees),'Employee count',reasons),revenueUSD=revenueOf(records,reasons);
  const excluded=profile.exclusions.some(term=>!!normalized(term)&&records.some(c=>[c.name,...c.aliases,c.domain??'',c.industry.value??''].some(v=>normalized(v).includes(normalized(term)))));
  const failures:string[]=[];
  if(country&&!profile.countries.some(v=>normalized(v)===normalized(country)))failures.push('Country is outside the target countries.');
  if(industry&&!profile.industries.some(v=>normalized(v)===normalized(industry)))failures.push('Industry is outside the target industries.');
  if(employees!==null&&employees<profile.minimumEmployees)failures.push('Employee count is below the mandatory minimum.');
  if(revenueUSD!==null&&revenueUSD<profile.minimumRevenueUSD)failures.push('Annual revenue is below the mandatory minimum.');
  const status=excluded?'Excluded':failures.length?'Ineligible':!identity||country===null||industry===null||employees===null||revenueUSD===null?'Needs Verification':'Eligible';
  const signals=records.flatMap(c=>c.signals).filter(s=>s.date&&s.date>=profile.start&&s.date<=profile.end&&verified(s.evidence));
  const recent=signals.map(s=>Math.floor((Date.parse(profile.end)-Date.parse(s.date!))/86400000));
  const signalScore=recent.length?(Math.min(...recent)<7?25:Math.min(...recent)<14?20:15):0;
  const tech=records.some(c=>c.technology.value&&verified(c.technology.evidence)&&profile.technologyPreferences.some(p=>{
   const value=c.technology.value!.toLowerCase(),term=p.toLowerCase();
   return value.includes(term)||(term.includes('sap')&&/\bsap\b.*(?:erp|s\/4|ecc)|(?:erp|s\/4|ecc).*\bsap\b/.test(value))||(term.includes('oracle')&&/\boracle\b.*(?:erp|e-business|fusion|netsuite)|(?:erp|e-business|fusion|netsuite).*\boracle\b/.test(value))||(term.includes('legacy')&&/legacy.*(?:planning|budget|forecast)|(?:planning|budget|forecast).*legacy/.test(value))||(term.includes('spreadsheet')&&/spreadsheet|excel/.test(value));
  }));
  const complex=records.some(c=>c.complexity.value===true&&verified(c.complexity.evidence));
  const coverage=[identity,country!==null,industry!==null,employees!==null,revenueUSD!==null,signals.length>0,records.some(c=>c.technology.value!==null&&verified(c.technology.evidence)),records.some(c=>c.complexity.value!==null&&verified(c.complexity.evidence))];
  const verifiedFields=coverage.filter(Boolean).length;
  const breakdown=status==='Eligible'?{industry:30,scale:Math.round((10*Math.min(1,employees!/(2*profile.minimumEmployees))+5*Math.min(1,revenueUSD!/(2*profile.minimumRevenueUSD))+(complex?5:0))*10)/10,signals:signalScore,technology:tech?15:0,geography:10}:null;
  return {id:first.id,name:first.name,records,status,reasons:excluded?['Matches a campaign exclusion.']:failures.length?[...failures,...reasons]:reasons,country,industry,employees,revenueUSD,score:breakdown?Math.round(Object.values(breakdown).reduce((a,b)=>a+b,0)*10)/10:null,breakdown,confidence:Math.round(verifiedFields/coverage.length*100),verifiedFields,totalFields:coverage.length};
 });
 const eligible=qualified.filter(c=>c.status==='Eligible').sort((a,b)=>b.score!-a.score!||b.confidence-a.confidence||a.name.localeCompare(b.name));
 return {eligible:eligible.slice(0,10),additionalEligible:Math.max(0,eligible.length-10),needsVerification:qualified.filter(c=>c.status==='Needs Verification'),ineligible:qualified.filter(c=>c.status==='Ineligible'),excluded:qualified.filter(c=>c.status==='Excluded'),duplicatesRemoved:report.companies.length-qualified.length};
}
