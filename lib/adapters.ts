/** Contracts for the next server increment. These are not live integrations. */
export type Evidence = {value:string;source:string;checkedAt:string;verification:'verified'|'unresolved';entity:string};
export interface ResearchAdapter {
 research(input:{countries:string[];industries:string[];start:string;end:string}):Promise<{brief:string;evidence:Evidence[]}>;
}
export interface DraftAdapter {
 generate(input:{channel:'connection'|'linkedin'|'email';verifiedFacts:Evidence[];approvedClaims:string[];limit?:number}):Promise<string>;
}
export interface EmailProvider {
 sendGMAlert(input:{idempotencyKey:string;to:string;owner:string;company:string;contact:string;sentAt:string;dueAt:string;recordUrl:string}):Promise<{deliveryId:string}>;
}
