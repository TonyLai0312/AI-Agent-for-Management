# Demo acceptance criteria

User's complete fixture workflow, version 0.2. This supersedes the browser-local shell checklist. See test-report.md for actual runs and failures corrected.

| Requirement | Acceptance condition | Coverage |
| --- | --- | --- |
| Six screens | Each named screen navigates and supports its workflow actions | Chromium click-through |
| Clear demo mode | Banner, synthetic research labels, visible simulated clock; no live claims | Browser assertions and visual review |
| Target profile | GM-only save; country/industry/scale/period/exclusion filters before capped shortlist; technology affects fixture score | Server schema/rules + UI save |
| Qualified prospect | Select, confirm identity and industry, approve source, generate/review/approve/send | Full UI path |
| Missing contact | Unresolved manual-search task; no fabricated LinkedIn URL; user can supply demo contact | UI + server rejection |
| Industry conflict | Cannot approve until a choice and reason are saved | UI + server tests |
| Logo-only reference | Claim approval rejected; explicit no-customer-claim route allowed | UI + server tests |
| Evidence edit | Revoke approval and invalidate affected drafts; retain history and sent snapshots | UI + direct API + domain test |
| Approval gates | API rejects skipped, stale, overlong, unauthorized or duplicate transitions | Direct API + domain tests |
| Persistence | Campaigns, companies, contacts, evidence, approvals, drafts, sends, updates, alerts and audit events survive database close/reopen | PostgreSQL integration test |
| Deadline and alert | Correct weekends/holidays; frozen deadline; once-only even under concurrent checks | Domain + direct API + UI |
| Late update | Resolves alert and routes normally, no duplicate invitation | Full UI path |
| Four branches | Accepted LinkedIn; pending email; declined stop; wrong contact discovery | Full UI path + domain tests |
| Email verification | Block manual email-send recording until address verified | UI rejection and successful retry |
| Safe reset | GM + exact confirmation; only demo campaign removed; restore five fixtures | UI + database sentinel test |
| Responsive interface | Desktop and 390px mobile; no horizontal viewport overflow | Chromium screenshots and assertion |
| Build readiness | Unit/integration, typecheck, production build, health endpoint and production browser suite pass | Final verification report |

Full live research, model quality, real authentication and unattended email delivery are outside fixture acceptance. No measured BDR time savings or 80% draft-usability score is claimed. The assignment still requires the team's slides, pitch and personal reflections.
