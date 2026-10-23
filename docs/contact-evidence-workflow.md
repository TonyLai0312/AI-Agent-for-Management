# Selected-company contacts and customer evidence

The live shortlist now offers **Select for contact review** to BDR. The server rechecks qualified company evidence, current profile/exclusions and workspace revisions before accepting a selection. Company identity and research-report IDs are retained; newer contradictory research blocks continuation. No fictional company is inserted when live research fails. The existing labelled demo workflow remains separate.

## Workflow and gates

1. BDR selects an eligible live company.
2. Public-source contact discovery searches CFO, Head of FP&A, Finance Transformation, Controller and CIO roles. Each candidate retains name, title, exact company entity, an actual cited profile URL or null, supporting source URL/title/passage/publication date, checked date and verification status. Names must occur in their supporting passages and profile URLs must appear in research citations. No email field is generated.
3. Results start unverified. Different company entities, ambiguous identity, former roles, source dates over a year old and undated sources are flagged. BDR must confirm current role and exact entity with a named reviewer and resolution note. A different entity needs a correctly scoped manual entry; a former title needs current evidence and a corrected title.
4. If no person is found, a cited company LinkedIn page is a proposal, not automatically verified. BDR may explicitly verify a known company page and retain suggested search titles. Otherwise an unresolved manual-search task remains. Neither fallback satisfies the person-confirmation gate. BDR may enter a contact with a public source and then confirm it separately. No guessed profile URL, person name or email address is filled into the manual form.
5. BDR confirms industry after contact confirmation. It must agree with qualified company evidence; a conflicting classification must first be resolved in research.
6. BDR reviews and approves a detailed customer reference, then explicitly confirms its use for this prospect, or records a **no customer reference** decision. A neutral draft is permitted without customer claims.
7. Only after all three gates are confirmed can server-side draft generation run. It rechecks eligibility and gates before the provider call and after it returns. A changed workspace rejects stale output. No message is sent automatically.

A successful contact rediscovery invalidates contact, industry and reference decisions for re-review. Failed rediscovery preserves previous records/confirmations and displays the failure. Contact/industry changes, reference edits, reference rejection and reference reapproval invalidate affected decisions and drafts. Invalidated drafts cannot be copied through the live UI. Qualification is checked again on every downstream action.

## Customer-evidence collection

`prospecting_workspaces` in the existing PGlite database stores selected companies, contact candidates, confirmation decisions, references, immutable prior reference snapshots, drafts, lookup states and audit events. It survives safe demo resets. All writes are server validated and versioned; provider requests run outside the storage lock. Interrupted requests become explicit retryable failures.

References contain customer entity, industry, application, exact permitted claim, source URL and/or supporting material excerpt, geographic/entity scope, logo-only marker, proposal/approval/rejection status, approver and date. Website proposals also retain retrieval/publication dates. A URL alone can be proposed, but approval requires a supporting excerpt and complete claim/scope metadata. A logo alone can never be approved for implementation or performance claims. Approval requires BDR review after confirmed contact/industry; the chosen reference must match the confirmed industry. Geography is preserved, never silently expanded to a regional/global deployment claim.

New references are always **proposed**. On 23 October 2026 the index and three detailed source pages were read and short public excerpts captured as initial unapproved proposals:

- [EVOX customer stories](https://www.evoxplatform.com/customer-stories/)
- [Weichuan Group Foods](https://www.evoxplatform.com/customer-stories/wei-chuans-comprehensive-budget-management-optimization-project/)
- [LAWSON China](https://www.evoxplatform.com/customer-stories/lawsons-comprehensive-budgeting-journey/)
- [Daiichi Sankyo China](https://www.evoxplatform.com/customer-stories/daiichi-sankyos-financial-transformation-revolutionizing-enterprise-budgeting-through-strategic-optimization/)

The **Retrieve latest EVOX customer stories** control uses live web search and validated extraction, restricted to cited EVOX customer-story URLs. It adds deduplicated proposals; it does not overwrite approved references or automatically approve new ones. Failed refresh retains the dated existing collection with an explicit failure rather than claiming fresh results.

BDR materials can be pasted or uploaded as UTF-8 `.txt`/`.md` excerpts, 10–6,000 characters, at most 24 KB. PDF/Office material must be supplied as a copied/exported text excerpt. Source material is treated as evidence, never instructions. File name, stored excerpt and its SHA-256 are persisted in the database; private material and database files are excluded from Git. Editing a reference increments its revision, clears approval metadata and invalidates dependent company decisions/drafts. Old approved content is retained in reference history.

The live drafting input carries only confirmed contact/company facts and the exact approved customer claim, entity, application and geographic scope. Raw uploaded source excerpts are not sent to drafting. Prompt version `evox-draft-v2` includes explicit geographic/application scope preservation. Generated drafts still require BDR review; validation does not replace human semantic fact checking.

## API and operational boundaries

`GET/POST /api/prospects` requires an existing campaign session; BDR is required for mutations. It uses body-size limits, strict input schemas, optimistic revisions and origin checks. Free-form `/api/ai` contact/match calls are rejected in favor of the selected-company workflow, preventing a selection/approval bypass. API/provider failures expose only sanitized messages/codes/request IDs. Demo role switching remains a restricted prototype facility, not production authentication. No production deployment was made.

Validation: 52 unit/database/adapter tests passed; TypeScript and production build passed. The 13 browser scenarios were exercised as 12 configured-runtime passes plus the missing-key scenario passing separately in an isolated child process. Browser fixtures are explicitly synthetic and isolated from user data. Coverage includes BDR selection, manual contact confirmation, industry gating, neutral no-reference decisions, exact customer-evidence approval, uploaded revisions revoking drafting, failure/retry UI, stale/unknown source rejection, persistence and safe reset preservation.

The actual live website-refresh request returned a visible failure: `invalid_api_key`, application HTTP 502, request ID `req_d389642d59b84309b88210ac7d6e8886`. Three previously retrieved public proposals were retained; zero references were approved. A successful live AI contact discovery or runtime reference refresh is not claimed while the OpenAI credential binding remains blocked.
