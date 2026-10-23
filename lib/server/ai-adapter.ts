/** The live server adapter. It has no fixture or template fallback. */
import {discoverCompanies,discoverContacts,matchIndustryAndReference} from './ai-tasks';
import {generateApprovedDraft} from './openai';
export const aiAdapter={
 research:discoverCompanies,
 contacts:discoverContacts,
 match:matchIndustryAndReference,
 draft:generateApprovedDraft,
};
