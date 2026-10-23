/** Shared adapter types; runtime AI code stays in lib/server. Monitoring email implementation: lib/server/gmail-alerts.ts. */
export type Evidence = {value:string;source:string;checkedAt:string;verification:'verified'|'unresolved';entity:string};
/** Live AI implementation: lib/server/ai-adapter.ts. Import it only on the server. */
export type AIAdapter=typeof import('./server/ai-adapter').aiAdapter;
export type EmailProvider=import('./server/gmail-alerts').AlertEmailProvider;
