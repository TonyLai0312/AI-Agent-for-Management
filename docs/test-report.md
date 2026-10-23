# EVOX Prospect Copilot — demo verification report

Current expanded evaluation: [acceptance cases, live failures and hosting preparation](evaluation/README.md). The material below records the earlier fixture baseline and is retained as historical evidence.
Date: 23 October 2026 (Singapore). Version: 0.2.0. Tested using Node 24.19.0, Next.js 16.4.2, PGlite 0.5.11, Playwright 1.64.1 and installed Chromium. All records are fixtures. These results evaluate the demo's workflow and storage, not AI research accuracy or business productivity.

## Subsequent OpenAI integration

See `openai-integration.md`: 24 unit/database/adapter tests and six production browser/API scenarios pass. The live connection check reports `not_configured`; this is not a verified live API connection. The baseline results below describe the preceding demo release.

## Final results

| Check | Result |
| --- | --- |
| Legacy deadline/routing regression tests | 9 passed |
| Current server-controller tests | 7 passed |
| PostgreSQL persistence/reset integration test | 1 passed |
| Production Chromium/API scenarios | 5 passed in 12.1 seconds |
| TypeScript check | Passed |
| Production build | Passed |
| `/api/health` | HTTP 200; embedded-postgresql, fixtures, demo-outbox-only |
| App server restart | Exact campaign JSON matched before and after development → production restart |
| Desktop/mobile review | Screenshots inspected; 390px mobile viewport has no horizontal overflow |
| Final state | Restored to five initial fixtures, one seeded overdue invitation, zero generated alerts |

## Complete browser walkthroughs

1. GM saves profile; BDR selects Meridian Foods, confirms contact/industry, approves reference, generates and approves connection draft. BDR edits evidence: prior draft invalidates. Reapproval/regeneration succeeds; manual send is persisted through browser reload. GM runs repeated overdue checks; only one alert per invitation is created. Late Accepted update resolves alert; next draft is a normal LinkedIn message.
2. Straits Chemicals displays an unresolved manual-search task and accepts BDR-supplied demo contact evidence. Lotus Consumer rejects industry approval until a conflicting classification is resolved with a reason. Archipelago Retail shows logo-only evidence and uses the approved no-claim path. Pending generates email; send recording fails until the address is verified, then succeeds. Declined blocks generation. Wrong contact returns to discovery and replacement identity confirmation. Mobile layout checked.
3. Direct requests reject wrong-role actions, unselected generation, skipped approvals, unapproved send, changed evidence, logo-only claims, no-contact confirmation, stale versions, BDR reset and wrong reset confirmation. These checks bypass disabled UI controls.
4. UI reset restores precisely five companies, one seeded draft/send, no status updates and no alerts.
5. Concurrent alert checks return one success and one stale-version conflict; retry produces no duplicate alert. Cross-origin mutation is rejected.

## Persistence and safe-reset evidence

The PostgreSQL integration test creates a temporary on-disk database, inserts a non-demo sentinel campaign and company, records an alert and late update, then closes and reopens the database. All campaign JSON and row counts match across campaigns, companies, contacts, evidence, approvals, drafts, sends, updates, alerts and events. Reset clears/reseeds only the demo campaign; the sentinel campaign/company survive. Changing the database demo flag to false blocks reset.

Separately, the running app's entire state was captured, its development server stopped, and the production server started against the same `.data/evox-postgres`. The retrieved state matched exactly. Browser reload persistence was also tested during the send workflow.

## Failures found and corrected

- **Origin-check bug:** the first browser run rejected legitimate same-site identity switches because Next.js's internal request origin differed from the browser host. Compare the Origin host with the request Host instead. Browser mutations now pass; cross-origin rejection remains tested.
- **Ambiguous form labels/test locators:** exact label queries did not consistently locate selects and nested textareas; Next.js also adds its own alert announcer. Added explicit accessible names to industry/status/evidence inputs and scoped assertions to the app error notice. Full click-through now passes.
- **Overlong draft editing:** review found that validating the old draft before an edit could prevent shortening overlong text. Edits now retain context validation but allow a new revision; approval/send apply the character limit. Regression test confirms rejection, correction and approval.
- **Port still occupied:** an initial production start found the previous dev child process still on port 3000. Stopped that owned process, restarted production successfully, and verified persistence. This was a test-environment issue, not data loss.

No failing final tests remain. These fixes do not establish production security or live AI quality.

## Remaining unimplemented / intentionally simulated

- Live SEA research, current public contact verification, OpenAI model calls and semantic validation of human-edited claims. All company/contact data and insight narratives are clearly labelled fixtures; drafts are deterministic templates.
- Real email delivery and unattended scheduling. The GM's clock/check controls simulate monitor ticks and persist demo alerts. No outbound email or LinkedIn API is invoked.
- Production login, user isolation, external PostgreSQL deployment/migrations and multi-process scaling. The current demo intentionally permits switching identities and shares one campaign.
- Calendars outside Asia/Singapore and arbitrary daylight-saving transitions; CRM integrations; measured draft-usability ratings and time savings.
- Presentation slides and individual reflections remain assignment deliverables outside this implementation request.

## Reproduce

Run `npm test`, `npm run typecheck`, `npm run build`, then `npm start` and (in a second terminal) `npm run test:browser`. Browser tests reset only this demo campaign. Use a dedicated test database if retaining a demo session is important. Do not run multiple app processes against one PGlite directory.

Screenshots: [desktop outreach](screenshots/outreach-desktop.png), [mobile contact review](screenshots/contact-mobile.png). Raw local results are in ignored `work/final-unit-results.txt` and `work/browser-results.json`.
