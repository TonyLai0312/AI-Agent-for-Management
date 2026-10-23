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

`OPENAI_MODEL` is optional. The default is `gpt-4.1-mini`; choose a Responses/structured-output-capable model available to your project. The supplied `.env.example` remains placeholders only. The official API host must be reachable through the configured environment network/proxy policy. The SDK uses the existing proxy and normal TLS verification.

```sh
npm run openai:check
npm run build
npm start
```

The check consumes a small API request when configured. Templates continue to work without credentials. OpenAI generation never silently falls back to a template: failures preserve existing records and show an explicit error.

## Validation and limits

Structured JSON is parsed and validated. Empty/malformed/incomplete output, over-limit drafts, changed approved claims, unapproved URLs/email addresses and unsupported numerical tokens are rejected. This is not exhaustive semantic fact checking; BDR review remains mandatory. Only approved context is supplied; unreviewed source passages, secrets, database connection details and arbitrary client prompts are not sent.

Research remains synthetic fixtures. Live web research/contact discovery, real email delivery, unattended scheduling and production authentication are not added by this increment. The app's identity selector remains a shared demo facility; use a restricted environment for a runtime carrying a billable API key.

## Verification — 23 October 2026

- 24 unit/database/adapter tests passed (17 existing + 7 OpenAI-specific tests).
- Six production browser/API scenarios passed, including all original five scenarios and the missing-key path. Tests used `work/openai-qa-postgres` on port 3100; existing `.data/evox-postgres` was not reset.
- TypeScript and production build passed.
- Tests cover structured request construction, constant connection-check prompt, no automatic approval, rejection of invalid output, sanitized SDK errors, gate checks before generation, stale results after concurrent changes, missing-key errors and unchanged state on failure.
- `npm run openai:check` was executed. Result: `not_configured`. `OPENAI_API_KEY` is not exposed in this process, no local environment file is present, and the managed runtime reports no secret binding. No authenticated live API request could be made. Neither live credentials nor model access has been verified.
- An initial CLI top-level-await incompatibility with the project's CommonJS execution was fixed by wrapping the script in an async function. The subsequent CLI check reached the expected sanitized configuration failure.

Read the official SDK's `node_modules/openai/README.md` and Responses type definitions for the implemented API contract. Existing Next.js route-handler documentation was also consulted. Mock-provider tests are not presented as evidence of a successful live OpenAI connection.
