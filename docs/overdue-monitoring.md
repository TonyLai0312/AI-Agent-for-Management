# Persistent overdue-status monitoring

Live invitation checks use dedicated PostgreSQL tables, independent of the fictional demo workflow. The existing prospect implementation and branch are preserved. Monitor records, alert state transitions and sanitized Gmail evidence persist across server restarts and demo resets.

## Deadline and status

When BDR records a manual connection send, the prospect record and monitoring record are saved in one transaction. The monitor captures the actual send timestamp, BDR owner/contact, calendar version, timezone, working weekdays, holiday dates and deadline. Default: Asia/Singapore, Monday–Friday. An admin can configure future invitation calendars in the Follow-up Tracker's live monitoring panel. The deadline is the same local wall-clock time five working days after sending, excluding the send date. A timezone-aware Temporal calculation handles DST; a nonexistent wall-clock time shifts forward through the DST gap, and an ambiguous time uses the earlier occurrence. Existing deadlines never change after calendar edits.

An automatic pending state immediately after recording a send is not a deliberate status check. BDR must record accepted, checked/pending, declined or wrong contact against that invitation. Any such update satisfies the initial check permanently. A late update resolves queued, failed or provider-accepted alerts, while retaining provider evidence. Routing remains accepted → LinkedIn; checked/pending → email; declined → stop; wrong contact → rediscovery. Another invitation for that person/entity is blocked. Status updates remain possible even if company research has since become ineligible. Historical send records added before this increment are marked as migrated; their calendar is captured during migration because their original calendar was never stored.

## Protected scheduler

`GET` or `POST /api/jobs/overdue` requires `Authorization: Bearer <CRON_SECRET>`. It ignores caller-supplied namespaces and always uses live records and the real clock. Demo role cookies do not authorize this job. No token is accepted in a URL. Each invocation processes up to five due alerts. The scheduler's JSON summary distinguishes queued, provider-accepted, failed and resolved counts; it never claims delivery.

Run `npm run monitor:scheduler` under a process supervisor alongside the persistent Next Node server. It calls that protected endpoint every minute, waits for the current invocation, and logs only status/counts. Configure `APP_BASE_URL` and the same runtime `CRON_SECRET` on the worker and app. `ops/evox-monitor.service` is a systemd example; adapt its paths/user and protect its environment file. This repository uses one PGlite-owning app process with a durable database directory. The scheduler calls HTTP and does not open the database. Do not deploy this embedded store across ephemeral/serverless instances. The service template is provided; installing a host service and actual external scheduling require the target host configuration.

## Claiming and Gmail idempotency

A database uniqueness constraint allows one outbox alert per namespace/invitation. SQL `FOR UPDATE SKIP LOCKED` and an expiring token lease atomically claim work. The frozen recipient/content and Gmail draft ID are retained. Immediately before dispatch, the worker locks/rechecks the latest status and compares the Gmail draft's exact recipient, sender, Message-ID and body with the frozen test-recipient payload. Status persistence shares the serialization/transaction boundary; a committed status update before dispatch suppresses sending. A status arriving after dispatch starts cannot retract the email, but still resolves the alert.

Gmail has no native idempotency-key parameter. This implementation does not pretend otherwise. It persists a deterministic Message-ID, stable draft ID and dispatch marker **before** its single `drafts.send` call. After a timeout, crash or uncertain response, a retry searches Gmail Sent for that exact Message-ID and verifies recipient/labels instead of sending again. This gives application-level at-most-once dispatch. A crash between the marker and the actual request may leave an unsent alert requiring manual investigation; the system will not sacrifice duplicate prevention by blindly resending. Preparation/preflight failures and definitive provider rejections (such as HTTP 401) can be retried with the same frozen draft; uncertain POST outcomes can only be reconciled. At most three automatic attempts are made per alert, with backoff; admin retry/reconciliation is explicit and does not create a new alert or another send after a dispatch marker. No recurring escalation is implemented.

The ledger records queued, claimed, provider-accepted, failed and resolved events. Gmail HTTP status, draft/message IDs, deterministic request identity, Sent labels, retrieval timestamps and a payload hash are retained without tokens, authorization headers or raw error bodies. A Gmail message with `SENT` confirms provider acceptance, **not recipient delivery**. The UI always shows delivery as unconfirmed; no delivered state is inferred.

## Gmail configuration — step by step

1. Open [Google Cloud Console](https://console.cloud.google.com/), select/create a project and enable **Gmail API**.
2. Configure **Google Auth Platform**: Branding, Audience and Data Access. For a personal Gmail account, use External; while in Testing, add your sending account as a test user. Add the scopes `https://www.googleapis.com/auth/gmail.compose` and `https://www.googleapis.com/auth/gmail.readonly`.
3. Create an OAuth client of type **Web application**. Add `https://developers.google.com/oauthplayground` as an authorized redirect URI.
4. Open [Google OAuth Playground](https://developers.google.com/oauthplayground/). In its settings, enable **Use your own OAuth credentials** and enter the OAuth client ID and secret there.
5. Request the two scopes above, authorize the sending account, then exchange the authorization code for tokens. Put the **access token** directly in the environment secret settings. Never paste it into chat or commit downloaded OAuth credentials.
6. Configure these settings for the app:

   | Setting | Value / purpose |
   | --- | --- |
   | `GMAIL_ACCESS_TOKEN` | Network secret bound to `gmail.googleapis.com`; authorized for the two scopes above |
   | Network allowlist | Allow `gmail.googleapis.com` |
   | `EMAIL_FROM` | Plain email address of the authorized Gmail account; the app verifies it against Gmail profile |
   | `EVOX_TEST_RECIPIENT` | The user's specified test mailbox; no prospect address is accepted |
   | `CRON_SECRET` | Random runtime secret of at least 32 characters; shared by app and scheduler |
   | `EVOX_ADMIN_SECRET` | Separate random runtime secret of at least 32 characters; admin access only |
   | `EVOX_ENABLE_MONITOR_TESTS` | `true` only when isolated monitoring tests are needed |
   | `APP_BASE_URL` | App's HTTPS origin, or loopback HTTP for local development |
   | `BDR_TIMEZONE` | Optional initial IANA timezone; defaults to `Asia/Singapore` |

7. Apply the environment settings and restart/re-attach the runtime if needed. Open **Follow-up Tracker → Persistent invitation status monitoring → Admin calendar and isolated monitoring tests**. Authenticate using the admin runtime secret, choose the isolated test namespace, and configure its calendar/clock there.
8. Run `npm run test:monitor-live`. It uses an isolated persistent QA ledger under `work/gmail-monitor-live`, creates one synthetic invitation, checks just before/at its deadline, sends only to `EVOX_TEST_RECIPIENT`, retains sanitized evidence in `work/gmail-monitor-live/provider-evidence.json`, retrieves Gmail Sent evidence and verifies that a late pending update resolves the alert without another email. Reruns reuse the same invitation/draft/dispatch ledger. Do not delete that ledger to retry an uncertain email.

OAuth access tokens expire. This increment consumes the configured access token and fails explicitly when it expires; it does **not** implement refresh-token storage or renewal. Arrange secure token rotation before enabling unattended operation, or add a reviewed server-side refresh-token flow. No Gmail password or app password is used.

Official documentation checked: [Google OAuth web-server flow](https://developers.google.com/identity/protocols/oauth2/web-server), [Gmail drafts lifecycle](https://developers.google.com/workspace/gmail/api/guides/drafts), [drafts.send](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.drafts/send), [Gmail search/filtering](https://developers.google.com/workspace/gmail/api/guides/filtering).

## Isolated clock and tests

Only `EVOX_ADMIN_SECRET` authorizes the admin endpoints; GM demo role selection is insufficient. Test-clock actions require both `namespace=test` and `EVOX_ENABLE_MONITOR_TESTS=true`. Test invitations/calendar/clock/outbox are separate from live rows. The scheduled live job never reads the test clock. Test records are explicitly synthetic; test-double provider evidence is marked `realProvider=false` and is not evidence that Gmail was contacted. The admin key is held only in the current browser component, never placed in a URL or local storage.

Run `npm test`, `npm run typecheck`, `npm run build`, `npm run test:browser:isolated` and `npm run test:missing-key`. The browser runner uses a disposable database and real server validation; it never invokes the due test-email send. The real Gmail test is separate and remains blocked until credentials, sender, test recipient and network access are configured.

Measured validation on 23 October 2026: 60 unit/database/adapter tests passed; typecheck and production build passed; 15 browser scenarios passed in the configured isolated run, plus the missing-key browser scenario passed separately (16 scenarios exercised). The live Gmail test reached an explicitly failed outbox state with code `configuration`: `GMAIL_ACCESS_TOKEN` was not configured. No Gmail request, accepted message ID or delivery evidence exists. The environment also lacked the Gmail network allowlist entry, sender/test-recipient variables and scheduler/admin runtime secrets. The failed QA ledger and sanitized result were retained locally under `work/gmail-monitor-live`; they are excluded from Git. The deployment scheduler has not been activated.
