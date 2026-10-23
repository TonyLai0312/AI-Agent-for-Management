# Render deployment: exact setup and verification

Status: prepared, not deployed. The user does not yet have a Render account/service, and this runtime has no Render credentials or public service URL. No remote persistence, access, AI or scheduled-email success is claimed. Local hosted-mode evidence is separate in `evaluation/evidence/hosted-local.json`.

## Recommended service

Use **one paid Render Web Service**, Node runtime, **Standard** instance type, Singapore region and a **1 GB persistent disk**. The Standard selection gives the embedded database and Next server more memory headroom than the smallest instance; it is a sizing recommendation, not a measured load-capacity guarantee. Review current charges in the Render dashboard. Do not use a Static Site, an ephemeral disk or multiple app instances for this PGlite deployment. Keep one Next process as the database owner; its sibling scheduler accesses it only through authenticated HTTP.

`render.yaml` prepares this exact topology and disables automatic deploys. The native Node start supervisor starts the app and HTTP scheduler together, and shuts down the service if either child dies. Database directory: `/var/data/evox/pg`. Only the persistent disk survives redeploys. Hosted mode automatically disables the public demo role-switch endpoint; demo fixtures remain visibly labelled within the app.

## 1. Create the accounts and service

1. Create a [Render account](https://dashboard.render.com/) and connect the GitHub account with access to `TonyLai0312/AI-Agent-for-Management`. Add billing for a paid service/disk.
2. Clone/pull branch `evox-prototype` locally. Use Node **24.19.0**, the runtime tested here, and run `npm ci`.
3. In a private local terminal, run `npm run accounts:setup`. Enter two different GM/BDR email identifiers and strong passwords (12–256 characters). Password entry is hidden. The command writes owner-only `.env.accounts` with salted scrypt hashes; it prints no password or hash. Keep this file private and excluded from Git. Open it locally only to copy the four environment values into Render.
4. In Render choose **New → Blueprint**, select the repository and branch `evox-prototype`, and use root `render.yaml`. Review the proposed single web service, Standard plan, Singapore region and disk. Render may adjust dashboard wording; the manifest is the source of exact settings.
5. Enter the values requested by the Blueprint:

   | Setting | Exact purpose |
   | --- | --- |
   | `GM_EMAIL`, `GM_PASSWORD_HASH` | Copy the two GM values from your private `.env.accounts` |
   | `BDR_EMAIL`, `BDR_PASSWORD_HASH` | Copy the BDR values; use a different account email |
   | `OPENAI_API_KEY` | Valid OpenAI project key with billing/model access; server-side environment secret |
   | `OPENAI_DRAFT_MODEL`, `OPENAI_RESEARCH_MODEL` | Supported models accessible to that project; configurable, not restricted to the provided defaults |
   | `GMAIL_ACCESS_TOKEN` | Fresh token for the Gmail sending account with compose and read-only scopes; see `overdue-monitoring.md` |
   | `EMAIL_FROM` | That authorized Gmail account's plain email address |
   | `EVOX_TEST_RECIPIENT` | `tonylai0312@gmail.com`, the explicitly authorized test mailbox |

6. Let Render generate `CRON_SECRET` and `EVOX_ADMIN_SECRET` using the manifest. They must be separate random runtime secrets of at least 32 characters. Do not put any credential into Git, screenshots, chat, URL query strings or browser local storage.
7. Confirm the remaining settings: `EVOX_AUTH_MODE=accounts`, `EVOX_DB_PATH=/var/data/evox/pg`, `BDR_TIMEZONE=Asia/Singapore`, `EVOX_ENABLE_MONITOR_TESTS=false`, `EVOX_SCHEDULER_TEST_ONCE=false`, `numInstances=1`. Never set `EVOX_AUTH_HTTP_TEST` on Render; it exists only for the isolated loopback test.
8. Deploy the Blueprint. The build command is `npm ci && npm run build`; the start command is `node scripts/start-hosted.mjs`; health endpoint is `/api/health`. Open the actual URL assigned by Render after it becomes healthy. This is a new service; no deployment from this session has happened yet.

Render environment secrets are ordinary server-side secrets containing real credentials. The ChatGPT workspace network-secret placeholders do not automatically transfer to Render. Do not copy a placeholder as the actual key. On this managed workspace, API hosts must also be allowed and secrets correctly bound; on Render, preserve TLS and use its server environment variables.

## 2. Verify authentication and permissions

1. Open the service in a private browser window. It must show a login form, not a role picker or private campaign data.
2. Without a cookie, request `/api/demo`, `/api/research`, `/api/prospects`, `/api/monitoring` and `/api/openai`; expect 401/403. `/api/health` intentionally exposes only non-secret health/runtime/boot identity.
3. Sign in as BDR. Attempt to edit the live GM research profile: the server must reject it with 403 even through a direct request. Sign in as GM and attempt a BDR prospect mutation: expect 403. POST `/api/demo/session` must always return 403 in hosted mode, even with a forged requested role.
4. Confirm logout revokes the stored session. Password-hash changes invalidate previous sessions. Cookies are HttpOnly, Secure on the hosted service and SameSite=Strict. Sessions expire after eight hours; login has persistent per-account throttling. This is a two-account prototype, not enterprise SSO/MFA or a multi-tenant deployment.

## 3. Verify restart persistence, live AI and one scheduled test alert

The prepared verifier performs real requests only against the actual URL you configure. It never creates a fictional deployment result.

1. Temporarily set `EVOX_ENABLE_MONITOR_TESTS=true`, while keeping `EVOX_SCHEDULER_TEST_ONCE=false`. Redeploy/restart so isolated test endpoints become available.
2. In a private local `.env.local` (excluded from Git), configure `VERIFY_BASE_URL` with the actual HTTPS Render origin, `VERIFY_GM_EMAIL`, `VERIFY_GM_PASSWORD`, `VERIFY_BDR_EMAIL`, `VERIFY_BDR_PASSWORD`, and `EVOX_ADMIN_SECRET` copied privately from Render. These passwords are verification inputs on your local computer only; they are not needed as plaintext on the app host.
3. Run `npm run verify:deployment -- --prepare`. It records a harmless target-profile marker, the current boot ID and one isolated synthetic invitation with its deadline. It preserves the original profile for restoration and saves a private checkpoint under ignored `work/`.
4. Set `EVOX_SCHEDULER_TEST_ONCE=true` on Render and **restart the service**. The app and protected scheduler restart against the same disk. The HTTP worker runs at boot and then each minute; the one-off test route reads only the isolated test namespace. Its outbox/dispatch ledger prevents another send after an uncertain attempt.
5. Run `npm run verify:deployment`. It requires a changed boot ID and the persisted marker, checks anonymous and GM/BDR restrictions, makes **one real minimal OpenAI Responses request**, and waits up to 90 seconds for an actual scheduled test tick and real Gmail acceptance evidence. It then records a late pending update to resolve that test alert and restores the original profile. Results are saved to `work/deployment-verification.json`.
6. Verify Gmail's retained message/draft IDs, HTTP evidence and `SENT` label. These establish provider acceptance, **not recipient delivery**. Confirm arrival in the test mailbox yourself if reporting delivery. If anything fails, preserve the failed result and fix the setting; do not delete the dispatch ledger or relabel it a pass. Rerun the prepare phase (or use the admin Retry / reconcile control) before restarting the one-off test worker; a previously failed alert is not silently reset. An uncertain send outcome is reconciled, never blindly resent.
7. After the test, set `EVOX_SCHEDULER_TEST_ONCE=false` and `EVOX_ENABLE_MONITOR_TESTS=false` and restart. Live invitation monitoring continues under the real clock. Check `overdue_job` logs and scheduled HTTP heartbeat events. The job processes five alerts per invocation, with bounded retries and explicit failure states.

If a Gmail token expires, the app records authentication failure; it does not silently send a replacement or pretend acceptance. This increment requires secure external access-token rotation; automatic refresh-token handling is not implemented. Arrange rotation before leaving the monitor unattended. If a scheduler or app process stops, Render restarts the supervisor; persisted overdue invitations remain eligible for checking. No high availability or disaster-recovery test is claimed.

## 4. Operational limits and backup

Keep a single database-owning instance. Disk-backed deployments can have restart downtime. Configure disk capacity/health alerts and a consistent database backup strategy before retaining important customer data; a tested backup/restore process is not part of this evaluation. Do not copy a live database directory as if it were a verified consistent backup. Retain evidence/audit records, protect administrator secrets, rotate credentials and keep test-recipient restrictions during development. Prospect outreach is never sent by the scheduler.

Official references checked on 23 October 2026: [Render Next.js Node service](https://render.com/docs/deploy-nextjs-app), [persistent disks](https://render.com/docs/disks), [Blueprint fields](https://render.com/docs/blueprint-spec). The YAML parsed locally, but Render-side schema/account validation and remote deployment remain pending.
