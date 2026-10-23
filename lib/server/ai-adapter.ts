/** The live server adapter. It has no fixture or template fallback. */
import {discoverContacts,matchIndustryAndReference} from './ai-tasks';
import {runMarketResearch} from './market-research';
import {generateApprovedDraft} from './openai';
export const aiAdapter={
 research:runMarketResearch,
 contacts:discoverContacts,
 match:matchIndustryAndReference,
 draft:generateApprovedDraft,
};
