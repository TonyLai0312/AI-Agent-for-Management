/** Explicit synthetic QA data. Used only in an isolated database by browser test runners. */
import {db} from '../lib/demo-db';
import {researchWorkspace} from '../lib/server/research-store';
import {initialResearchProfile,type ResearchCompany,type ResearchReport,type Source} from '../lib/market-research';
import {randomUUID} from 'node:crypto';
export async function seedProspectBrowser(){
 if(!process.env.EVOX_DB_PATH?.includes('work/'))throw new Error('Browser fixture seed requires an explicit work/ database.');
 await researchWorkspace();const pg=await db();const source=():Source=>({id:randomUUID(),url:'https://example.org/explicit-browser-fixture',title:'Explicit synthetic browser fixture',passage:'A test-only company fact, never live research.',publicationDate:null,retrievedAt:new Date().toISOString(),status:'verified',reviewedAt:null,reviewedBy:null,reviewNote:'QA fixture only'});
 const fact=<T>(value:T)=>({value,evidence:[source()]});const profile=initialResearchProfile();
 const company:ResearchCompany={id:'browser-fixture-company',name:'Browser Fixture Foods',aliases:[],domain:'example.org',registrationId:null,identityEvidence:[source()],country:fact('Indonesia'),industry:fact('Food & Beverage Manufacturing'),employees:fact(600),revenue:{amount:400000000,currency:'USD',reportingYear:2025,period:'annual',evidence:[source()],fxRateToUSD:null,fxDate:null,fxEvidence:[]},signals:[],technology:{value:null,evidence:[]},complexity:{value:null,evidence:[]}};
 const report:ResearchReport={id:'browser-fixture-report',profile,retrievedAt:new Date().toISOString(),model:'explicit-synthetic-test',responseIds:[],trends:[],companies:[company],limitations:['Explicit synthetic test data; not real company research.']};
 await pg.query('INSERT INTO research_workspaces(id,data) VALUES($1,$2) ON CONFLICT(id) DO UPDATE SET data=excluded.data',['evox-live-market',JSON.stringify({version:1,profile,report,reportHistory:[],job:null,history:[],reviews:[]})]);await pg.close();delete (globalThis as {evoxDB?:unknown}).evoxDB;
}
