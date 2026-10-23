/** Shared adapter types; runtime AI code stays in lib/server. Email remains unimplemented. */
export type Evidence = {value:string;source:string;checkedAt:string;verification:'verified'|'unresolved';entity:string};
/** Live AI implementation: lib/server/ai-adapter.ts. Import it only on the server. */
export type AIAdapter=typeof import('./server/ai-adapter').aiAdapter;
export interface EmailProvider {
 sendGMAlert(input:{idempotencyKey:string;to:string;owner:string;company:string;contact:string;sentAt:string;dueAt:string;recordUrl:string}):Promise<{deliveryId:string}>;
}
