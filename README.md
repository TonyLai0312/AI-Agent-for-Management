# EVOX Prospect Copilot — database-backed demo

Six-screen EMBA prototype: target profile, synthetic market insights/shortlist, contact/industry review, customer evidence approval, outreach drafting, and follow-up/GM alerts. All company/contact research is explicitly fictional. No credentials required.

## Run

Node 20.9+ (tested with Node 24.19.0).

```sh
npm ci
npm run dev
```

Open http://localhost:3000 and choose **BDR** or **GM** in the demo identity selector. The app initializes embedded PostgreSQL (PGlite) at `.data/evox-postgres` automatically. Keep that directory to preserve records. Run only one app process against this database directory. Do not deploy this shared, switchable-identity demo as a production CRM.

For a production build of the demo:

```sh
npm run build
npm start
```

## Demo walkthrough

1. As GM, review/save target criteria. Switch to BDR and select Meridian Foods.
2. Confirm its simulated contact and industry. Approve the Wei Chuan passage, or choose no customer claim.
3. Generate a template, edit/save a revision, approve it and record a simulated manual send time at or before the visible clock.
4. Edit approved evidence to demonstrate automatic approval revocation and downstream draft invalidation. Reapprove and regenerate before sending.
5. As GM, open the tracker and check overdue tasks. The seeded Pacific Pharma invitation is overdue. Repeated checks create only one durable demo alert.
6. As BDR, record Accepted to resolve the alert and generate a LinkedIn message. Pending routes to email (verify recipient before recording send), Declined stops drafting, Wrong contact returns to identity review.
7. Try Straits Chemicals (manual-search task), Lotus Consumer (industry conflict), and Archipelago Retail (logo without story).
8. As GM, type `RESET DEMO` on Target Profile to restore only this demo campaign. Export demo records before reset if desired.

The simulated clock starts at **23 October 2026, 10:00 SGT**. Working days are Monday–Friday excluding the GM's configured ISO holiday list. Advancing the clock does not send any email; click Check overdue tasks to simulate the monitor's tick. Each deadline is frozen when the send is recorded.

## Verify

```sh
npm test
npm run typecheck
# With the app already running:
npm run test:browser
```

Browser tests use `/usr/bin/chromium` by default. Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` to your Chromium binary, or install Playwright Chromium and remove `executablePath` from the config. Browser tests intentionally reset the demo campaign; do not point them at a live system. Screenshots and JSON test results go to ignored `work/`.

See `docs/build-plan.md`, `docs/acceptance-criteria.md` and `docs/test-report.md`. Runtime table creation is in `lib/demo-db.ts`. `db/production-schema-proposal.sql` is an unused proposal for a future hosted backend, not the current migration.

## Optional OpenAI drafting

The template workflow still runs without credentials. For real model-generated drafts on the same labelled demo inputs, bind `OPENAI_API_KEY` to the server runtime (never NEXT_PUBLIC), optionally set `OPENAI_DRAFT_MODEL` and `OPENAI_RESEARCH_MODEL`, and restart. The GM screen has a connection check; Outreach Draft has **Generate with OpenAI**. Existing approvals and BDR review remain required.

```sh
npm run openai:check
```

See `docs/openai-integration.md` for setup, tests and the live-connection verification status. The current environment has no accessible key; live verification is blocked until the secret is bound. Research remains fixtures.

### Live AI task services

The server adapter separates market/company research, public contact discovery, industry/reference matching and approved drafting. Configure `OPENAI_RESEARCH_MODEL`, `OPENAI_CONTACT_MODEL`, `OPENAI_MATCH_MODEL` and `OPENAI_DRAFT_MODEL`; each defaults to `gpt-4.1-mini`. Run `npm run openai:check` for sanitized live connection and web-search outcomes. See `docs/openai-integration.md` for API schemas, limits and prototype authentication constraints. Suggestions require human review and do not replace the visibly labelled fixture records automatically.

### Live market research and qualification

Open GM Target Profile to edit the live mandatory criteria, signal dates, technology preferences and exclusions. In Market Insights and Prospect Shortlist, run live research as GM, then review public-source passages as GM or BDR. Only verified eligible companies are ranked; missing mandatory facts stay in Needs Verification. Progress, explicit failures and retry controls are persisted. See `docs/live-market-research.md` for provenance, currency/year handling, scoring and verification rules. Live results remain separate from the labelled fixture outreach workflow.

### Selected-company contacts and customer evidence

As BDR, select a qualified live company in the shortlist, then use the live panels on Contact and Industry Review, Customer Evidence Approval and Outreach Draft. Public candidates require explicit current-role/entity confirmation; manual entry and company-page/manual-search fallbacks are supported. Confirm industry next, approve and choose a scoped customer reference or choose no reference, then generate a gated draft. New website/BDR-material evidence remains unapproved; edits revoke dependent decisions. See `docs/contact-evidence-workflow.md` for source metadata, text-excerpt uploads and validation.

Live outreach now includes status-based channel routing, confirmed BDR relationship history, configurable connection length with bounded rewriting, approved-claim provenance, editable draft versions, server-validated approval/copy and separate actual manual-send records. See [outreach drafting](docs/outreach-drafting.md). Sending always happens manually outside EVOX.

Persistent invitation-status monitoring now saves five-working-day deadlines with calendar versions, uses a protected scheduled job and atomic outbox claims, and sends internal alerts only to the configured Gmail test recipient. It records provider acceptance separately from delivery and isolates admin simulated clocks from live records. See [monitoring implementation and Gmail setup](docs/overdue-monitoring.md). The real email test requires the Gmail environment configuration described there.


The current [acceptance evaluation](docs/evaluation/README.md) preserves all ten requested inputs/results, live-provider failures and the observed improvement cycle. [Render setup](docs/deploy-render.md) prepares one persistent hosted instance with assigned GM/BDR accounts and a protected scheduler; no remote deployment is claimed. [Assignment evidence](docs/assignment/README.md) includes the diagram, actual screenshots, two-minute script and exactly two submission slides.
