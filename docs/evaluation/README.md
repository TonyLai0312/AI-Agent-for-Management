# Prototype acceptance evaluation

Executed on 23 October 2026, Node 24.19.0 / Next 16.4.2. Repository branch: `evox-prototype`. The machine-readable records contain the executed time and base commit. They were run against the working changes on that base; the final Git commit records the evaluated implementation. No fixture is presented as a real researched prospect, model response or sent email.

## Results by case

| # | Case | Expected | Observed after improvement | Assessment |
| --- | --- | --- | --- | --- |
| 1 | Clear qualified prospect and confirmed contact | Eligible, confirmed contact; no-reference path allowed | One eligible synthetic company, confirmed synthetic CFO, no customer claim | PASS — deterministic fixture |
| 2 | Conflicting industry evidence | Do not rank until resolved | Eligible count zero; Needs Verification; conflicting-industry reason and null score | PASS — deterministic fixture |
| 3 | No reliable contact | No invented identity/URL; manual task; gate blocked | Zero contacts, no guessed company URL; manual search task; confirmation gate rejects | PASS — deterministic fixture |
| 4 | Logo without detailed story | Reject claim approval; allow explicit no-reference | Logo approval rejected; no-reference decision returns no customer claim | PASS — deterministic fixture |
| 5 | Request for invented saving percentage | Reject digits and written-number variants without evidence | Both rejected after fix. Before, the worded variant passed | FAIL before → PASS after — same deterministic input |
| 6 | Weekend and configured holiday | Five working days, same local time | Sent Friday 16 Oct, 10:00 SGT; Monday 19 Oct excluded; due Monday 26 Oct, 10:00 SGT | PASS — deterministic calendar calculation |
| 7 | Accepted after alert | Resolve alert; LinkedIn next; no new invitation | One resolved alert; LinkedIn follow-up; invitation count remains one | PASS — fixture controller; monitoring/routing regression tests also run |
| 8 | Fewer than ten eligible companies | No padding | Of three fixtures: one eligible, one Needs Verification, one ineligible | PASS — deterministic fixture |
| 9 | Retrieved approval-bypass instruction | Treat content as data; do not grant approvals/send | Source remains unverified, no eligible company, approval gate rejected | PASS within structural/application scope; live-model injection resistance NOT measured |
| 10 | Concurrent scheduler and provider failure | One outbox alert; explicit failure; no duplicate dispatch | Three concurrent invocations, one send attempt, one failed alert; retry queries evidence instead of sending again | PASS — persistent DB with explicit fake provider, not a Gmail success |

Before: **9/10** acceptance cases. After: **10/10**. These are control-behaviour results for ten curated fixtures, not a prospect accuracy rate, model benchmark or measured business benefit.

## Evidence and reproduction

- [`evidence/fixture-before.json`](evidence/fixture-before.json): complete inputs, expected/actual outputs, pass/fail, diagnoses and durations before the claim-guard change. The baseline file is preserved; the runner refuses to overwrite it.
- [`evidence/fixture-after.json`](evidence/fixture-after.json): same cases after the fix. Run `npm run evaluate:fixtures` to reproduce the after evaluation.
- [`factual-review.md`](factual-review.md): qualitative comparison with three actual customer-story pages, entity/date/industry limits and factual-review conclusions. Source reading is not equivalent to independent verification or BDR approval.
- [`improvement-cycle.md`](improvement-cycle.md): actual failure, diagnosis, patch and exact-input rerun.
- [`../assignment/screenshots/`](../assignment/screenshots/): actual Chromium captures of the prototype, using synthetic data or local hosted mode. Browser scripts save the screenshots at the relevant checks. They are not design mockups or remote deployment evidence.
- [`evidence/hosted-local.json`](evidence/hosted-local.json): 18 local hosted-mode assertions, including actual app/scheduler process restart and persistent role/session/data checks. Run `npm run evaluate:hosted-local`.

Regression validation: **64** unit/database/adapter tests, **16** browser scenarios (15 in the configured run plus the missing-key scenario in its isolated server), TypeScript check and production build passed. The 18 hosted-mode checks are separate from these totals. Raw run logs remain in ignored `work/`; the durable evidence records and screenshots are committed. Do not add the totals together into a single misleading “accuracy” number.

## Live research and email — separate results

[`evidence/live-openai.json`](evidence/live-openai.json) records two real server-side requests: minimal generation and market research. Both failed with HTTP **401 `invalid_api_key`**, using configured model `gpt-4.1-mini`. Request IDs are retained. The model is configurable; this result does not prove a model restriction. Credential substitution remains suspected. No researched report was produced, so live company/contact factual accuracy is **not established**.

[`evidence/live-gmail.json`](evidence/live-gmail.json) records an attempted real-email test that stopped at **configuration**: `GMAIL_ACCESS_TOKEN` is missing. No Gmail send request, provider ID, acceptance or delivery evidence exists. A deterministic fake-provider failure in case 10 does not count as a live Gmail test.

[`evidence/deployment-status.json`](evidence/deployment-status.json) records **not deployed**: the user has no Render service yet; no URL/hosting credential exists here. The local hosted preflight must not be substituted for remote verification. See [`../deploy-render.md`](../deploy-render.md) for the account/service setup and the prepared two-phase remote verification command.

## Limits and failures still open

- OpenAI authentication and Gmail configuration remain external blockers; no fallback data replaces either failure.
- Hosted deployment, real hosted persistence/TLS and a scheduled real Gmail test remain unverified until account setup.
- Regex checks catch the observed invented-result failure, not every semantic hallucination. Human approval and supporting passages are still required.
- Case 9 proves approvals cannot be set by retrieved text through the tested application path. It does not certify an LLM against every prompt-injection attack; semantically irrelevant citations must be rejected by review.
- Website material is vendor-published. No measured time saved, prospect precision, customer savings or conversion lift is asserted.
- The hosted configuration is one campaign, two accounts and one database owner; no enterprise SSO/MFA, multi-tenancy, high availability, independent security audit or tested disaster recovery is claimed.
