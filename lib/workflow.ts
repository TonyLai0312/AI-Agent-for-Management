import { references } from './references';
export type Status = 'awaiting' | 'accepted' | 'checked/pending' | 'declined' | 'wrong contact';
export type Prospect = { id: string; name: string; country: string; industry: string; employees: number; revenue: number; technology: string; signal: string; signalDate: string; selected: boolean; contact: string; source: string; contactConfirmed: boolean; industryConfirmed: boolean; evidenceConfirmed: boolean; draft: string; draftApproved: boolean; sentAt?: string; updatedAt?: string; status: Status; alertAt?: string; resolvedAt?: string; referenceId?: string; deadline?: string; };
export type Criteria = { countries: string; industries: string; employees: number; revenue: number; technologies: string; exclusions: string; start: string; end: string; limit: number; holidays: string; };
export const defaults: Criteria = { countries: 'Singapore, Malaysia, Thailand, Indonesia, Philippines, Vietnam, India, Hong Kong, Taiwan, Japan, Korea', industries: 'Food & Beverage Manufacturing, Grocery Retail, Pharmaceutical, Chemical, High Tech Manufacturing, FMCG', employees: 300, revenue: 200, technologies: 'SAP, Oracle E-Business Suite, SAP BPC, Oracle Hyperion, Excel', exclusions: '', start: '2026-09-23', end: '2026-10-23', limit: 300, holidays: '' };
const split = (s: string) => s.toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
export function rank(prospects: Prospect[], c: Criteria) {
  return prospects.filter(p => split(c.countries).includes(p.country.toLowerCase()) && split(c.industries).includes(p.industry.toLowerCase()) && p.employees >= c.employees && p.revenue >= c.revenue && !split(c.exclusions).some(x => `${p.name} ${p.industry}`.toLowerCase().includes(x)) && p.signalDate >= c.start && p.signalDate <= c.end).map(p => ({ ...p, score: 30 + Math.min(20, Math.floor(p.employees / 500)) + 25 + (split(c.technologies).includes(p.technology.toLowerCase()) ? 15 : 0) + 10 })).sort((a,b) => b.score - a.score || a.name.localeCompare(b.name)).slice(0,10);
}
export function dueAt(sent: string, holidays: string[] = []) {
  // Singapore is fixed UTC+08:00, with no DST. Workday boundary uses local date.
  const d = new Date(new Date(sent).getTime() + 8 * 3600000);
  if (!Number.isFinite(d.getTime())) throw new Error('Invalid send time');
  let days = 0;
  while (days < 5) { d.setUTCDate(d.getUTCDate()+1); if (![0,6].includes(d.getUTCDay()) && !holidays.includes(d.toISOString().slice(0,10))) days++; }
  return new Date(d.getTime() - 8 * 3600000).toISOString();
}
export function checkAlerts(items: Prospect[], now: string, holidays: string[] = []) {
  return items.map(p => p.sentAt && !p.updatedAt && !p.alertAt && new Date(now) >= new Date(p.deadline ?? dueAt(p.sentAt, holidays)) ? { ...p, alertAt: now } : p);
}
export function route(status: Status) { return ({awaiting:'Await status update',accepted:'LinkedIn message','checked/pending':'Email draft',declined:'Stop outreach','wrong contact':'Contact discovery'})[status]; }
export function recordStatus(p: Prospect, status: Exclude<Status,'awaiting'>, now: string): Prospect {
  if (!p.sentAt) throw new Error('Record the actual send time first.');
  return { ...p, status, updatedAt: now, resolvedAt: p.alertAt ? now : undefined, ...(status === 'wrong contact' ? { contact: '', source: '', contactConfirmed: false, industryConfirmed: false, evidenceConfirmed: false, draft: '', draftApproved: false } : {}) };
}
export function connectionDraft(p: Prospect) {
  if (!p.selected || !p.contactConfirmed || !p.industryConfirmed || !p.evidenceConfirmed) throw new Error('Complete all BDR approvals first.');
  const ref = references.find(r => r.id === p.referenceId);
  return `Hi ${p.contact}, I’m with EVOX. ${ref ? ref.claim + ' ' : ''}I’d welcome a connection to exchange perspectives on FP&A and planning. Would you be open to connecting?`;
}
export function recordSend(p: Prospect, sentAt: string, limit: number, now = new Date().toISOString(), holidays: string[] = []): Prospect {
  if (!p.draftApproved || !p.contactConfirmed || !p.industryConfirmed || !p.evidenceConfirmed || !p.draft.trim() || Array.from(p.draft).length > limit) throw new Error('Approve a valid draft and complete all review gates.');
  if (!Number.isFinite(Date.parse(sentAt)) || Date.parse(sentAt) > Date.parse(now)) throw new Error('Send time must be valid and cannot be in the future.');
  if (p.sentAt) throw new Error('This outreach already has a send time.');
  return {...p,sentAt,deadline:dueAt(sentAt,holidays),status:'awaiting'};
}
export function seed(): Prospect[] {
  const rows: [string,string,string,number,number,string,string][] = [
    ['Meridian Manufacturing','Singapore','Food & Beverage Manufacturing',4200,680,'SAP','Multi-market planning complexity'],
    ['Archipelago Retail Group','Indonesia','Grocery Retail',8500,920,'Oracle E-Business Suite','Demand forecasting across stores'],
    ['Straits Chemicals','Malaysia','Chemical',2800,310,'SAP','Scenario planning for operating costs'],
    ['Lotus Consumer Group','Thailand','FMCG',6100,740,'Microsoft','Consolidation across business units'],
    ['Mekong Precision','Vietnam','High Tech Manufacturing',1800,280,'Oracle E-Business Suite','Capacity and working-capital planning'],
    ['Pacific Pharma','Philippines','Pharmaceutical',1200,295,'SAP','Rolling forecasts across regions']
  ];
  return rows.map((r,i) => ({id:String(i+1),name:r[0],country:r[1],industry:r[2],employees:r[3],revenue:r[4],technology:r[5],signal:r[6],signalDate:'2026-10-15',selected:false,contact:'',source:'',contactConfirmed:false,industryConfirmed:false,evidenceConfirmed:false,draft:'',draftApproved:false,status:'awaiting'}));
}
