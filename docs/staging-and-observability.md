# Staging plan and observability baseline

## Environments
| Env | Purpose | Providers |
|---|---|---|
| local | Developer machine; `infra/docker-compose.yml` | mocks |
| staging | Shared URL for app/admin developers and QA (Day-2 target) | provider **test mode** (Razorpay test, Maps key with quota) |
| production | Pilot and later | live only; `PROVIDER_MODE=mock` is rejected at boot |

**Hosting is undecided** (question to lead). Requirements: Node 20 runtime, managed MongoDB replica set (e.g. Atlas),
managed Redis, HTTPS, secret store, log shipping. Staging is deployed in Phase 3.5; Phase 0 only provides the
CI pipeline (`.github/workflows/ci.yml`) and the health endpoints a platform needs.

## Deployment checklist (to be filled when hosting is chosen)
- Build: `npm ci && npm run build`; start: `npm start`.
- Release step, BEFORE starting the new version: `npm run indexes:prod` (creates any new indexes; production does not build them at boot). Add `-- --prune` when an existing index changed shape (Phase 5 changed the vehicle registration index) or you mean to drop indexes no schema declares.
- First deploy only: `npm run seed:prod`, then replace the placeholder zone and fares with real ones (fare configs are versioned: add new versions, deactivate the placeholder zone).
- Liveness probe: `GET /api/v1/health/live`; readiness probe: `GET /api/v1/health/ready`.
- SIGTERM triggers graceful shutdown: readiness turns 503, server stops accepting, connections close (10 s hard cap).
- Secrets from the platform secret store, never from Git.
- **Run ONE instance** until the Redis socket adapter exists: live events only reach sockets on the same instance, and the in-memory rate limiter is per instance. The database sweeper, reconciler and push worker are safe on several instances.
- WebSockets must be allowed by the host/load balancer (sticky sessions are not needed with the websocket transport only).
- Real payments: set `PAYMENTS_DRIVER=razorpay` with `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` (TEST keys outside production). In the Razorpay dashboard add a webhook to `https://<api-host>/api/v1/webhooks/razorpay` with the same secret and the events `payment.captured`, `order.paid`, `payment.failed`, `refund.processed`, `refund.failed`. Leave `PAYMENTS_DRIVER` unset for mock payments (no real money; a development-only completion route is exposed outside production).
- Run `npm run indexes:prod` on release: Phase 6 added the ledger, payments, refunds, settlements and webhook collections.
- Real push: set `PUSH_DRIVER=fcm` and `FCM_SERVICE_ACCOUNT_JSON`; leave both unset to keep mock push.

## Observability baseline (Phase 0)
- Structured JSON logs (pino) with `requestId` on every line; request logging via pino-http (health probes excluded).
- Redaction: authorization header, cookies, passwords, OTPs, tokens, payment signatures.
- `X-Request-Id` on every response; the same id appears in error envelopes.

## Deferred to Phase 8 (listed so they are not forgotten)
Metrics (latency, dispatch timeouts, GPS staleness, payment failures, webhook lag, queue depth), error tracking
(e.g. Sentry), alerting, log shipping, backups and restore drill.

## Phase 7 additions
- **New background jobs** (started by the server with the other timers): safety escalation every 30 s (an SOS not acknowledged in 2 minutes is raised to super admins), housekeeping every 60 s (rating averages repaired from the ratings; coupon uses given back for bookings that never became rides).
- **Release step:** run `npm run indexes:prod` after deploying Phase 7 (new collections: feature flags, emergency contacts, safety incidents, trip shares, support tickets, ratings, coupons, coupon usage). Add `-- --prune` only if the report says an index changed shape.
- **SOS in production:** `featureDefaults.SOS` is `false` when `NODE_ENV=production`. Switch it on with `PUT /admin/feature-flags/SOS` `{ "enabled": true }` only when someone is staffed to answer `ops:sos`.
- **Alerts worth setting up in Phase 8:** an incident `OPEN` for more than 2 minutes, `ESCALATED` events, CSV exports of more than 10,000 rows, `report.export` and `safety.incident.view` audit entries.
- **Real SMS** (`backend/src/providers/nimbus.ts`, NOT yet verified live): set `SMS_DRIVER=nimbus` plus `SMS_API_URL, SMS_USER_ID, SMS_PASSWORD, SMS_SENDER_ID, SMS_ENTITY_ID, SMS_TEMPLATE_ID` (the DLT template for the login OTP) and `SMS_OTP_MESSAGE` (the exact registered wording with `{otp}`). Emergency texts to saved contacts are sent only if `SMS_ALERT_TEMPLATE_ID` is also set (a second DLT template: "{#var#} has raised an emergency alert during a ride. Follow the trip: {#var#}"); set `TRIP_LINK_BASE` to the web page that shows a shared trip. First live check: one OTP to a phone you hold.
- **Real push**: create a Firebase project, download a service-account JSON key, put it (one line) in `FCM_SERVICE_ACCOUNT_JSON` and set `PUSH_DRIVER=fcm`. Adapter is built and unit-tested; first live check is one push to a real device.

## Phase 8 additions
- **Monitor** (`monitoring/monitor.service.ts`): runs every 60 s as a background job and on demand at `GET /admin/system/health`. Set `ALERT_WEBHOOK_URL` to a Slack/Discord-style incoming webhook (accepts `{ "text": "..." }`) to get alerts; without it alerts are only in the log (`"alert": true`). What each alert means and what to do: `docs/runbook.md`.
- **Thresholds** (code defaults, `MonitorConfig`): search stuck 10 min, SOS open 5 min, push waiting 5 min, money grace 10 min, a job dead after 5 missed runs, same alert repeated every 30 min.
- **Limits** (code defaults): 120 writes/min per caller, 15 coupon-code quotes per 5 min, 120 socket connection attempts/min per address, HTTP header timeout 15 s, request timeout 30 s, keep-alive 65 s.
- **Start-up checks:** `CORS_ORIGINS` may not contain `*` in staging/production; access and refresh JWT secrets must differ.
- **Metrics** (`monitoring/metrics.ts`, in memory per server instance): request count and speed per route pattern (never real ids), status classes, server errors in the last 5 minutes, memory and event-loop lag. Read them at `GET /admin/system/metrics` (OPS, SUPER_ADMIN) or, for a metrics tool, `GET /api/v1/metrics` in Prometheus text with `Authorization: Bearer <METRICS_TOKEN>` (set `METRICS_TOKEN`, 16+ characters; without it that endpoint does not exist). The monitor raises `error_rate` when 5+ server errors happen in 5 minutes and they are 5%+ of requests. Not built: Sentry-style error grouping; the log (`unhandled error`, with request id) is the record.
- **Load tests** (server needs `STAGING_FIXED_OTP` and raised limits for the test machine; never production):
  - Riders only: `BASE_URL=https://<staging> FIXED_OTP=<code> RIDERS=200 CONCURRENCY=40 npm run loadtest`. Sign-in, quote, book, cancel, live connection.
  - Full rides: `BASE_URL=... FIXED_OTP=<code> ADMIN_PHONE=<staff phone> DRIVERS=20 RIDERS=30 DURATION_SECONDS=120 npm run loadtest:rides`. Creates approved drivers through the staff API, drivers send locations and answer offers, riders book, every ride is driven to completion. Reports time to assign a driver, rides completed, location updates and speed per endpoint. The staff account must exist (seed) and sign in with the fixed OTP.
  - Both exit non-zero above 1% server errors/no-answer (4xx rule answers and rate limits are not counted as errors).
- **Release gate:** `npm run gate`; checklist in `docs/release-gate.md`.
