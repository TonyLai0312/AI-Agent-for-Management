import {applyAction,RuleError} from '../demo-service';
import type {Action} from '../demo-service';
import type {DemoState,Role} from '../demo-types';
import type {ApprovedDraftInput,GeneratedDraft} from './openai';
export function prepareOpenAI(state:DemoState,action:Action,role:Role):ApprovedDraftInput {
 const candidate=applyAction(structuredClone(state),{...action,action:'generate'},role);
 const draft=candidate.drafts.at(-1)!;
 const company=candidate.companies.find(c=>c.id===action.companyId)!;
 const contact=candidate.contacts.find(c=>c.id===draft.contactId)!;
 const evidence=candidate.evidence.find(e=>e.id===draft.evidenceId);
 return {channel:draft.channel,contactName:contact.name,contactRole:contact.title,company:company.name,industry:company.industry,approvedClaim:evidence?.claim??null,entity:evidence?.entity??null,characterLimit:draft.channel==='connection'?state.campaign.profile.limit:2000,demo:true};
}
export function finishOpenAI(state:DemoState,action:Action,role:Role,result:GeneratedDraft){
 // Re-run gates and optimistic version validation after the external request. Any intervening edit/reset rejects this result.
 if(action.version!==state.campaign.version)throw new RuleError('Workspace changed during AI generation. No draft was saved; review the changes and retry.',409);
 const next=applyAction(state,{...action,action:'generate'},role);
 const draft=next.drafts.at(-1)!;draft.text=result.text;draft.provider='openai';draft.model=result.model;draft.responseId=result.responseId;draft.generatedAt=result.generatedAt;draft.promptVersion=result.promptVersion;
 const event=next.events.at(-1)!;event.action='generate-openai';event.detail='OpenAI draft generated from approved demo inputs; BDR review required.';
 return next;
}
