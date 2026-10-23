# Live market research and qualification

The GM Target Profile screen includes a separately persisted **Live research target profile**. Defaults are Indonesia, Thailand, Vietnam, Malaysia and the Philippines; Food & Beverage Manufacturing and Retail; 300 employees; annual revenue of USD 200 million; and 30 calendar dates ending today in Asia/Singapore. All fields and campaign exclusions are editable. Existing fixture workflows and their profile are separately labelled.

Mandatory gates: verified company identity, target country, target industry, employee minimum and annual revenue minimum. A company with missing, unreviewed or conflicting mandatory facts enters **Needs Verification**, with no fit score. Sourced facts proving a threshold failure enter **Ineligible**. Campaign exclusions apply before ranking and match company names, known aliases, domains and industry keywords. Recent buying signals and technologies are preferences, not mandatory gates. Older annual-report/staff evidence can qualify scale; only buying signals are filtered by the selected date range.

`lib/server/market-research.ts` uses live OpenAI web research followed by strict structured extraction. Market trends and company facts have separate schemas and storage. Every material fact retains source URL, citation title, supporting passage, publication date or null, retrieval timestamp, verification status and review history. URLs must appear in web-search citations and supporting passages must appear in the research findings. These checks establish traceability, not truth: extracted evidence starts **unverified**. GM or BDR must check the linked source and confirm the exact fact/entity/date with a review note to verify a claim. Source pages are not independently fetched or deemed verified by this app. Retrieved text is passed as untrusted data, never instructions; React renders it as text.

Financial figures retain original amount (absolute units), ISO currency, reporting year and annual/quarterly/unknown period. Quarterly/unknown-period amounts cannot establish annual revenue. Non-USD annual revenue needs a dated, separately sourced USD-per-unit exchange rate with verified conversion evidence. Conversion is calculated in code and rounded to USD cents. No symbol-based currency guessing, unsourced FX, annualization or invented amounts are used. For duplicate records, the latest reported year is used while historical figures and passages remain available. Conflicting current facts require resolution/rejection of conflicting evidence.

Company deduplication normalizes names/legal suffixes and known aliases or registration IDs; distinct known jurisdictions/registration IDs stay separate. All original records and source passages are retained. Only eligible companies are ranked, at most ten; the list is never padded. Discovery is a bounded pass over public search results, not an exhaustive census, and can return fewer candidates or no supported findings.

## Fit and confidence

| Component | Maximum | Rule |
| --- | --- | --- |
| Industry | 30 | Confirmed mandatory industry match |
| Scale/complexity | 20 | Up to 10 for twice employee minimum; 5 for twice revenue minimum; 5 for verified multi-entity/site complexity |
| Recent signals | 25 | Verified in-window signal within final 7 dates: 25; final 14: 20; earlier in window: 15; otherwise 0 |
| Technology | 15 | Verified evidence of a preferred ERP, legacy planning tool or spreadsheet process |
| Geography | 10 | Confirmed mandatory country match |

Evidence confidence is a separate percentage of eight verified fields: identity, country, industry, employees, annual revenue/conversion, an in-window signal, technology and complexity. It measures review coverage rather than statistical truth. A market-level trend cannot fill a company evidence gap. No score substitutes for a mandatory fact.

## Persistence and progress

`/api/research` reads a dedicated `research_workspaces` record in the existing PGlite database. It contains profile, immutable run snapshots, latest successful report, archived earlier successful reports, progress/failure status and evidence-review audit entries. Profile and reviews use optimistic workspace revisions. Runs are single-flight and reject concurrent attempts. Profile/evidence edits are blocked during a run. GET polling shows queued, searching, extracting, qualifying and completed/failed phases while POST remains open. Interrupted runs become retryable failures. Reloading preserves state. Successful replacements archive the previous report including its complete source passages and financial years; archived reports can be downloaded from the research panel. Research has its own table and survives safe demo resets. Changing the profile recalculates qualification and flags that a new discovery pass is needed for the changed scope.

Failures preserve the prior successful report with an explicit **Previous successful report — latest attempt failed** label; a failed run never returns fixtures or fabricated companies. Retry creates a new live attempt with the current profile. Shared server request limits, timeouts, bounded retries, token limits, refusals and schema validation remain enforced by the OpenAI adapter. Error messages and request IDs are sanitized. No credentials are returned to the browser or stored in research records.

Role boundaries: GM edits profile/runs research; GM or BDR reviews public-source claims. Sessions remain the existing restricted prototype's demo identities, not production authentication. Live companies are not silently inserted into the fictional outreach workflow or given contact/customer-claim approvals. Production deployment and multi-worker background execution are outside this increment.

## Measured verification

- 46 unit/database/adapter tests passed, including qualification thresholds, date-window scoring, FX and annual-period handling, deduplication/conflicts, exclusions, provenance extraction, persistent failures/retries, review audits, report archiving and survival across demo reset/database reopen.
- TypeScript and the production build passed.
- Browser/API suite: nine passed; its configured-runtime missing-key case was skipped. That case was then run separately with an empty key only in an isolated child process and passed. Browser checks exercise profile editing, progress during an outstanding research request, explicit failure/retry UI and verified evidence moving a company into the eligible shortlist. Provider output in these browser checks is explicitly mocked test data, not a successful live discovery claim.
- A real `/api/research` run reached OpenAI and failed authentication (`invalid_api_key`, provider HTTP 401, application failure HTTP 502). Request ID: `req_3927640abcd74ab99a26a8538b4656b0`. It persisted a failed attempt with no report and zero eligible companies. No fixtures were substituted. Live extraction and company results remain unverified until the environment's credential binding is repaired.
