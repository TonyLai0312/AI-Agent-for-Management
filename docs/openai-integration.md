# Server-side OpenAI integration

## Implemented

The existing `evox-prototype` branch was fetched and inspected at commit `9c1fd9e5df71f18fd4398215528ca77820f88266`. The six-screen demo, PostgreSQL records, templates, approval gates and reset workflow are preserved.

- `lib/server/openai.ts`: official OpenAI SDK, Responses API structured outputs, `store: false`, fixed official API destination, environment-proxy support, timeout/retry limits and sanitized errors. No credential or raw provider error is returned to the browser or logged.
- `lib/server/openai-workflow.ts`: validate approvals before the external call and recheck workspace version/gates in the save transaction afterward. Network calls do not hold the database transaction open. Changed evidence, reset or another mutation causes stale output to be rejected.
- `POST /api/demo` action `generate-openai`: BDR-only generation from approved contact, company, confirmed industry and exact approved claim. The generated draft is persisted with provider, model, response ID, generation time and prompt version. It still requires BDR approval and manual send recording.
- `GET /api/openai`: exposes configured/not-configured and model metadata only, never the key. `POST /api/openai`: GM-only minimal connection test, throttled to once per ten seconds.
- GM Target Profile includes a Test OpenAI connection button. Outreach Draft includes Generate with OpenAI alongside the original template generator. Fixtures remain explicitly labelled; using a language model does not convert synthetic data into live research.
- `npm run openai:check`: minimal server-side Responses call requesting only OK. CLI loads local Next.js environment files without printing their contents. Output is a safe result or sanitized error. It does not print provider bodies, credentials or generated text.

## Runtime setup

Bind `OPENAI_API_KEY` to the Node app's runtime using the environment's secret settings, then restart the app. Alternatively, configure a local ignored `.env.local` yourself. Do not paste the key into chat, commit it, prefix it with NEXT_PUBLIC, or place it in browser code. GitHub repository/Actions secrets do not automatically reach this workspace or running app.

`OPENAI_DRAFT_MODEL` and `OPENAI_RESEARCH_MODEL` are optional. The default is `gpt-4.1-mini`; choose a Responses/structured-output-capable model available to your project. The supplied `.env.example` remains placeholders only. The official API host must be reachable through the configured environment network/proxy policy. The SDK uses the existing proxy and normal TLS verification.

```sh
npm run openai:check
npm run build
npm start
```

The check consumes a small API request when configured. Templates continue to work without credentials. OpenAI generation never silently falls back to a template: failures preserve existing records and show an explicit error.

## Validation and limits

Structured JSON is parsed and validated. Empty/malformed/incomplete output, over-limit drafts, changed approved claims, unapproved URLs/email addresses and unsupported numerical tokens are rejected. This is not exhaustive semantic fact checking; BDR review remains mandatory. Only approved context is supplied; unreviewed source passages, secrets, database connection details and arbitrary client prompts are not sent.

Research remains synthetic fixtures. Production prospect/contact discovery, real email delivery, unattended scheduling and production authentication are not added by this increment. The app's identity selector remains a shared demo facility; use a restricted environment for a runtime carrying a billable API key.

## Verification — 23 October 2026

- 24 unit/database/adapter tests passed (17 existing + 7 OpenAI-specific tests).
- Six production browser/API scenarios passed, including all original five scenarios and the missing-key path. Tests used `work/openai-qa-postgres` on port 3100; existing `.data/evox-postgres` was not reset.
- TypeScript and production build passed.
- Tests cover structured request construction, constant connection-check prompt, no automatic approval, rejection of invalid output, sanitized SDK errors, gate checks before generation, stale results after concurrent changes, missing-key errors and unchanged state on failure.
- `npm run openai:check` was executed. Result: `not_configured`. `OPENAI_API_KEY` is not exposed in this process, no local environment file is present, and the managed runtime reports no secret binding. No authenticated live API request could be made. Neither live credentials nor model access has been verified.
- An initial CLI top-level-await incompatibility with the project's CommonJS execution was fixed by wrapping the script in an async function. The subsequent CLI check reached the expected sanitized configuration failure.

Read the official SDK's `node_modules/openai/README.md` and Responses type definitions for the implemented API contract. Existing Next.js route-handler documentation was also consulted. Mock-provider tests are not presented as evidence of a successful live OpenAI connection.


## Current integration verification — 23 October 2026

Source: `evox-prototype` at `53baf063993dc922e4470ec18d8d0f92b810f0b4`; local work branch `evox-openai-integration`.

- Draft generation now uses `OPENAI_DRAFT_MODEL`; research uses `OPENAI_RESEARCH_MODEL`. Both default to `gpt-4.1-mini`. The legacy `OPENAI_MODEL` setting is replaced; migrate custom overrides to the two new variables.
- `researchWithSources` uses Responses with required live `web_search` and source inclusion. It returns text and citation titles, URLs and offsets only after validating a completed search and citations. Missing citations and incomplete responses fail explicitly. It does not promote results into verified prospect records or replace fixture data.
- `npm run openai:check` checks project model visibility, then runs one minimal text request and one research request. Reports contain only outcome, model and sanitized errors, never generated text or raw SDK errors. Retries are disabled.
- Matched the installed undici fetch to its proxy dispatcher: mixing Node's bundled fetch with undici 8 caused `UND_ERR_INVALID_ARG` before network access. Normal proxy routing and TLS verification remain enabled.
- Current official SDK README and Responses type definitions were inspected. Project model listing succeeded and included `gpt-4.1-mini`. Both live Responses requests failed with HTTP 401 authentication errors. Model listing alone does not establish generation permission. Billing/quota and successful web citations remain unverified.
- No credential was printed or written to source. No fallback data is returned on live errors.
- 27 tests, TypeScript and production build passed after the changes. No UI/workflow transition changes were made; browser tests were not rerun.

The earlier verification section above describes the previous branch baseline, not this run.

## Separated AI tasks — current implementation

`lib/server/ai-adapter.ts` is the live adapter. It exposes four distinct operations:

| Operation | Server implementation | Model variable |
| --- | --- | --- |
| Market research and company discovery | `discoverCompanies` | `OPENAI_RESEARCH_MODEL` |
| Public professional contact discovery | `discoverContacts` | `OPENAI_CONTACT_MODEL` |
| Industry/customer-reference matching | `matchIndustryAndReference` | `OPENAI_MATCH_MODEL` |
| Approved outreach drafting | `generateApprovedDraft` | `OPENAI_DRAFT_MODEL` |

All defaults are `gpt-4.1-mini`, listed by the current API project. Generation remains unverified because Responses requests return authentication failures. The connection script checks visibility of all four configured model IDs; it does not silently switch models on errors.

Discovery uses required live web search followed by strict structured extraction. The official SDK `zodTextFormat` helper generates JSON schemas; results are parsed again with Zod. Company/contact source URLs must occur in the preceding web-search citations. Unknown employee/revenue data stays null. Results are `needs_verification`, not automatically eligible, ranked, approved or saved. A citation proves provenance, not factual correctness. No contacts means a sourced company LinkedIn page or an explicit manual-search task. No email-address guessing is implemented.

Matching uses the server-owned customer-reference catalog. Reference IDs, confirmed industry, entity scope and claim must match the catalog exactly; no-match uses nulls. This recommendation does not replace human evidence approval. Drafting remains behind the existing server approval/version gates via `/api/demo`, with no automatic sending.

`POST /api/ai` accepts `{ "task": "research" | "contacts" | "match", "input": { ... } }` and returns suggestions only. GM can research; BDR can discover contacts and match references. Input contracts are exported from `lib/server/ai-tasks.ts`. Draft requests use the existing `generate-openai` workflow action, not arbitrary browser-supplied approval claims. API failures return `{ok:false, code, error}`. There is no live-to-demo fallback. Existing labelled demo screens continue displaying fixture records until a separate reviewed import/UI workflow is implemented.

Controls: 30-second timeout per provider attempt, at most one SDK retry; 60 logical provider calls per rolling minute per process; two concurrent calls; 30,000 input characters; at most 4,000 output tokens; three built-in tool calls per web research response; 32 KiB task HTTP bodies. Discovery consumes two provider calls. Refusals, incomplete responses, invalid JSON/schema output and missing/unknown citations fail explicitly. Usage logs contain task, outcome, duration, input and output token counts only. No prompts, generated content, raw provider errors, headers or credentials are logged.

The limiter and demo sessions are appropriate only to this single-process restricted prototype. Multi-instance production needs shared rate limits and real authenticated roles/ownership; the existing demo identity switch is not production authentication. No production deployment was performed.

Official references checked before implementation: the installed official SDK README and Responses definitions, and the current [OpenAI SDK Zod helper](https://github.com/openai/openai-node/blob/main/src/helpers/zod.ts). See also [Responses](https://developers.openai.com/api/reference/resources/responses) and [web search](https://developers.openai.com/api/docs/guides/tools-web-search).

Current measured checks: 35 unit/database/adapter tests passed; TypeScript and production build passed. Browser/API regression suite: six passed, one skipped because its missing-key scenario requires an unconfigured runtime (the configured credential was preserved). Browser tests used an isolated `work/ai-task-qa-db`. Live minimal text generation and web research both failed explicitly with HTTP 401 authentication errors using `gpt-4.1-mini`; no successful live generated content or citations are claimed.

## HTTP 401 diagnosis and isolated test — 23 October 2026

The same Node v24.19.0 SDK client was used for model listing and Responses: `process.env.OPENAI_API_KEY`, `https://api.openai.com/v1`, existing environment proxy, and no project/organization override. Model listing returned 200. A control request that omitted Authorization also returned 200. Thus the earlier claim that model listing proved authenticated project access was not justified. These were real outgoing requests, but upstream authentication of the model list cannot be verified from this environment's behavior.

The network binding reports current/ready for `OPENAI_API_KEY`, target environment variable `OPENAI_API_KEY`, domain `api.openai.com`; network policy reports enforced. However, in-memory comparison of the provider's masked rejected value with the runtime value matched both prefix and suffix. Neither value nor fragments were emitted. This strongly indicates the runtime placeholder is reaching the endpoint without effective substitution, or the backing binding is incorrectly configured. No application base-URL, runtime, project or organization difference explains it. Actual secret validity cannot be evaluated until injection works.

Latest text-generation check: model `gpt-4.1-mini`, HTTP 401, type `invalid_request_error`, code `invalid_api_key`, sanitized message “OpenAI rejected the configured server credential.” Request ID `req_df0652c44961475b8055bc2196ddebd3`. Web search was not run after this failure; it now runs only after the minimal text check succeeds. No live citations are claimed.

Required environment action: re-save the network secret using the actual OpenAI API key, with name/environment variable `OPENAI_API_KEY` and destination `api.openai.com`, then refresh/restart the environment so its proxy receives the binding. If a refreshed binding still passes a placeholder through, the environment secret-injection service needs repair; changing the model or API billing cannot fix placeholder substitution. Do not put the credential in chat, source files, public variables, or Git. No secret/permission change was made by the application.

`npm run openai:diagnose` reproduces the same-client comparison and unauthenticated control without logging headers or secret fragments. Error metadata uses this SDK version's `requestID` (or the `x-request-id` header), rather than the unsupported `request_id` property. Only allowlisted type/code values, a constrained request ID and a generic sanitized message are retained.

`npm run test:missing-key` starts a dedicated child server with an empty key and temporary fixture database, runs the formerly skipped browser test, then stops the child and removes its database. Parent environment and configured secret are unchanged. Result: one passed, zero skipped. The full unit/database/adapter suite now has 36 passing tests; typecheck and production build passed. Prior browser regression run: six passed; the missing-key case is now independently verified.
