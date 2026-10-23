/** The live server adapter. It has no fixture or template fallback. */
import {matchIndustryAndReference} from './ai-tasks';
import {discoverPublicContacts} from './contact-discovery';
import {runMarketResearch} from './market-research';
import {generateApprovedDraft} from './openai';
export const aiAdapter={
 research:runMarketResearch,
 contacts:discoverPublicContacts,
 match:matchIndustryAndReference,
 draft:generateApprovedDraft,
};
