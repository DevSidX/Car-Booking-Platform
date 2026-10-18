# Runbook: what to do when something goes wrong

Written for the person on call. Health view: `GET /api/v1/admin/system/health` (OPS or SUPER_ADMIN login). Alerts arrive in the channel set in `ALERT_WEBHOOK_URL` as `ALERT <name>: <what is wrong>` and `RECOVERED <name>`. The same lines are in the server log with `"alert": true`.

## Alerts and what to do

### `sos_unacknowledged` (most urgent)
An SOS has been OPEN for 5+ minutes, escalation did not get it picked up.
1. Open `GET /admin/incidents?status=OPEN`, take it (`POST /admin/incidents/{id}/acknowledge`).
2. Open the incident (`GET /admin/incidents/{id}`): rider and driver phone numbers, vehicle, last position. Call the rider, then the driver.
3. Poll `GET /admin/incidents/{id}/location` while it is open. Contact police/ambulance if the person cannot be reached or asks for help.
4. Add notes as you go; close with `resolve` and the outcome.
5. Afterwards: why did it take 5 minutes? (nobody staffed, push not delivered, wrong role?) Fix the cause.

### `ledger_balanced`
Money records do not add up. **Do not run payouts or settlements until fixed.**
1. `GET /admin/finance/consistency` shows what is off (unbalanced transaction, ride without money recorded).
2. A ride without money recorded is repaired by the finance job within a minute; if it stays, look for errors in the log containing "accrual".
3. An unbalanced transaction should be impossible: stop and get a developer. Keep the transaction id from the report.

### `payments_not_in_ledger` / `webhooks_unfinished`
A customer paid (or Razorpay called us) and our books do not show it.
1. Check the Razorpay dashboard for the payment. If captured, the repair job re-checks it every minute; wait 2 minutes.
2. Still wrong: Razorpay dashboard -> webhooks -> re-send the event. Replays are safe.
3. Customer waiting: tell support the payment is safe; never ask the customer to pay again until finance confirms it did not capture.

### `dispatch_stuck`
Bookings have been searching 10+ minutes (normally a search gives up in a few minutes).
1. Is the background job running? Look at `jobs_alive` in the same report. If a job is dead, restart the server.
2. Are drivers online at all? `GET /admin/dashboard`.
3. Retry a stuck booking: `POST /bookings/{id}/dispatch/retry` (OPS).

### `push_backlog`
Push messages are waiting. Usually Firebase credentials or an outage.
1. Check the log for "push" errors. Invalid credentials: fix `FCM_SERVICE_ACCOUNT_JSON` and restart.
2. Firebase outage: it recovers by itself; the app also works without push (riders see status when they open the app).

### `error_rate`
At least 5 server errors (5xx) in the last 5 minutes and 5% or more of all requests.
1. `GET /admin/system/metrics` shows which routes are failing (status classes per route) and the server's memory and event-loop lag.
2. The log lines `unhandled error` carry the request id and the cause. Database unreachable? See "Database down or slow". Started right after a release? Roll back.
3. Remember it counts one server instance only; with several instances check each.

### `jobs_alive`
A background job stopped succeeding (named in the alert).
1. Read the error lines just before (`dispatch <job> failed`). Database down? See below.
2. Restart the server; if the same job fails again, switch off what depends on it (see "Switching things off") and get a developer.

## Other situations

**Payment gateway down.** Riders can still book with cash. Online payments fail with an error; the app should offer cash. Nothing to repair: unfinished payments expire and the repair job reconciles when Razorpay returns.

**Database down or slow.** `GET /health/ready` fails; the load balancer stops sending traffic. Atlas status page and metrics first. Do not restart repeatedly. When it returns, background jobs resume and repair half-finished work on their own.

**A bad release.** Roll back to the previous build (indexes are only ever added, so older code still works). Then run `npm run gate` on the build you intend to ship next.

**Switching things off without a deploy** (`PUT /admin/feature-flags/{key}` `{ "enabled": false }`, CONFIG_ADMIN or SUPER_ADMIN): `SOS`, `TRIP_SHARING`, `SUPPORT_TICKETS`, `RATINGS`, `COUPONS`. A bad coupon: `PATCH /admin/coupons/{id}` `{ "active": false }`.

**A person must lose access now.** Customer: `PATCH /admin/users/{id}/status` `{ "status": "SUSPENDED", "reason": "..." }` (OPS). Driver: the driver approval decision SUSPEND. Staff: SUPER_ADMIN only. Suspending ends their login and live connection immediately.

**Leaked secret.** Replace it (JWT secrets, Razorpay, SMS, Firebase, database password), redeploy. Replacing a JWT secret signs everyone out, which is fine. Razorpay and database passwords are changed in their dashboards first, then in the server settings.

## Backups and restore (fill in when the host exists)
- Atlas: turn on continuous cloud backup for the production cluster (M10 or larger; the free M0 has none).
- Restore drill: restore the latest snapshot to a NEW cluster, point a staging server at it, run `GET /admin/finance/consistency` and `GET /admin/system/health`, open a few rides. Record the date and how long it took here: **not done yet**.

## Contacts (fill in)
Safety desk phone: ______  Finance: ______  Developer on call: ______  Razorpay support: ______  Atlas support: ______
