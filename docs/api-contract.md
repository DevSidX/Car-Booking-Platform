# API contract conventions (v1)

Base path: `/api/v1`. This file is the source of truth for cross-cutting rules. Endpoint-level contracts live in
the OpenAPI spec (`GET /api/v1/openapi.json`) and `postman/`. Breaking changes require a new version and
simultaneous update of the apps.

## Contract status and change policy (v1.0)
**Frozen for mobile and admin development as of Phase 3.5 (2026-10-17).** The OpenAPI document reports `version: 1.0.0`.
The shape is frozen; the business values behind it (fares, zone, dispatch timings, cancellation rules) are
placeholders until the lead confirms them, and changing a value is not an API change.

| Change | Allowed? |
|---|---|
| New endpoint, new optional request field, new response field, new enum value on a response, new error code | Yes, additive. Clients must ignore unknown response fields, treat unknown statuses as "keep polling", and show a generic message for unknown error codes |
| Remove or rename an endpoint, field, enum value or error code; make an optional field required; change a field's type, unit or meaning; change who may call an endpoint | **No.** Needs lead approval and a new API version (`/api/v2`) with the old one kept running until the apps migrate |
| Bug fixes that make the server stricter in line with this document | Yes, announced in `CONTEXT.md` |

Every change updates `backend/src/docs/routes.ts` (single source for OpenAPI and Postman); `tests/contract.test.ts` fails if a mounted route is undocumented.
Integration notes for app developers: `docs/mobile-integration-guide.md`; live events and push: `docs/realtime-contract.md` (socket events follow the same additive-only policy).

## Conventions
| Topic | Rule |
|---|---|
| Auth | `Authorization: Bearer <accessToken>`; refresh tokens rotate |
| Content type | `application/json`, body limit 100 kB |
| Idempotency | `Idempotency-Key` header on booking creation, payment creation, refunds and other retryable mutations |
| Pagination | `?page=1&limit=20` (max limit 100) or cursor-based for large event lists |
| Timestamps | ISO-8601 UTC, e.g. `2026-10-16T12:30:00.000Z` |
| Money | Integer paise (₹253.60 = `25360`), field names end in `Paise` |
| Coordinates | API: `{ "lat": number, "lng": number }`. DB: GeoJSON `[lng, lat]`. lat ∈ [-90, 90], lng ∈ [-180, 180] |
| Request id | Every response has `X-Request-Id`; a well-formed inbound one (8–64 chars `A-Za-z0-9_-`) is reused |
| Unknown fields | Rejected on sensitive endpoints |
| Client-supplied trust | Never trust client fare, role, user id, payment status, ride status, driver eligibility |

## Success envelope
```json
{ "success": true, "data": {}, "meta": { "requestId": "req_abc123" } }
```

## Error envelope
```json
{
  "success": false,
  "error": {
    "code": "RIDE_INVALID_STATE",
    "message": "Ride cannot perform this action in its current state.",
    "fieldErrors": [{ "field": "pickup.lat", "message": "Number must be <= 90" }],
    "requestId": "req_abc123"
  }
}
```
`/health/ready` on failure additionally returns `data.dependencies` (`up`/`down` per dependency).

## Error codes (frozen; add, never rename)
| Code | HTTP |
|---|---|
| `VALIDATION_ERROR` | 400 |
| `UNAUTHENTICATED` | 401 |
| `FORBIDDEN` | 403 |
| `FEATURE_DISABLED` | 403 (the feature is switched off for this role: hide it in the app; see `GET /config/flags`) |
| `NOT_FOUND` | 404 (also used when a resource is not visible to the caller) |
| `CONFLICT` | 409 |
| `RIDE_ALREADY_ASSIGNED` | 409 |
| `RIDE_INVALID_STATE` | 409 |
| `OTP_INVALID` | 401 |
| `OTP_EXPIRED` | 401 |
| `OTP_ATTEMPTS_EXCEEDED` | 429 |
| `NOT_SERVICEABLE` | 422 |
| `QUOTE_EXPIRED` | 422 |
| `QUOTE_ALREADY_USED` | 409 |
| `QUOTE_MISMATCH` | 422 |
| `IDEMPOTENCY_KEY_REUSED` | 422 |
| `PICKUP_OTP_INVALID` | 422 |
| `PICKUP_OTP_EXPIRED` | 422 |
| `PICKUP_OTP_ATTEMPTS_EXCEEDED` | 429 |
| `DRIVER_NOT_ELIGIBLE` | 403 |
| `OFFER_UNAVAILABLE` | 409 |
| `NOT_AT_PICKUP` | 422 |
| `LOCATION_REJECTED` | 422 |
| `NOT_AT_STOP` | 422 |
| `UNPAID_BALANCE` | 402 |
| `PAYMENT_SIGNATURE_INVALID` | 400 |
| `NO_SHOW_TOO_EARLY` | 422 |
| `UNPROCESSABLE` | 422 |
| `RATE_LIMITED` | 429 |
| `INTERNAL_ERROR` | 500 |
| `PROVIDER_ERROR` | 502 |
| `SERVICE_UNAVAILABLE` | 503 |

Source: `backend/src/common/errors.ts`. Later phases add domain codes (e.g. `PAYMENT_AMOUNT_MISMATCH`) and list them here.

The endpoint list is `backend/src/docs/routes.ts`; OpenAPI (`GET /api/v1/openapi.json`) and the Postman collection are generated from it.

## Status codes
200 read/update · 201 created · 202 accepted async · 400 malformed · 401/403 authn/authz · 404 not found/not visible ·
409 state conflict/duplicate/already assigned · 422 business validation · 429 rate limit · 500/502/503 server/provider.

## Module pattern
`route → validation (zod) → controller → service → repository/model`. No business logic in route handlers.
Every endpoint declares its authorization (role + object ownership).

## Phase 7 conventions
- **Feature flags.** Read `GET /config/flags` at start-up and after login: `{ SOS, TRIP_SHARING, SUPPORT_TICKETS, RATINGS, COUPONS }` as booleans for the caller's role. A call to a switched-off feature returns `403 FEATURE_DISABLED`. SOS is off by default in production until the safety desk is staffed.
- **Who may call what.** Every documented route lists its allowed roles; `backend/tests/rbac-matrix.test.ts` calls every route as every role and fails if the code and the documentation disagree (a role not listed gets 403).
- **Coupons.** Send `couponCode` on `POST /fare-quotes`. A bad code returns `422 UNPROCESSABLE` with `fieldErrors[0] = { field: "couponCode", message }` (does not exist, expired, not valid here, already used, fully used...). The quote then shows `coupon { code, discountPaise }` and `estimatedPayablePaise`. The use is taken when the booking is created and given back if the ride never happens.
- **Public trip link.** `GET /public/trips/{token}` needs no login and is rate limited per IP; an unknown, stopped or expired link is a plain 404.
- **CSV downloads.** `GET /admin/exports/{kind}` returns `text/csv` (not the JSON envelope) with a `Content-Disposition` filename. Errors before the download starts use the normal JSON error envelope.
- **Staff-only fields.** Ticket internal notes, incident snapshots (phone numbers) and rating rater ids are never returned to riders or drivers.

## Phase 8 conventions
- **Rate limits.** `429 RATE_LIMITED` can come from: the address-wide limit, the login limits, a per-caller write limit (120 per minute across all write calls), coupon-code attempts (15 per 5 minutes) and the public trip link (60 per minute per address). Apps should wait and retry later, never in a tight loop.
- **No caching.** Every API response has `Cache-Control: no-store`.
- **Too-large bodies** (over 100 KB) return `400 VALIDATION_ERROR` "Request body too large."
- **Sockets.** Too many connection attempts from one address are refused with `RATE_LIMITED` before any login check; reconnect with a growing delay.
- **Operations health.** `GET /admin/system/health` (OPS, SUPER_ADMIN) returns `{ ok, checkedAt, checks[{ name, ok, count, detail }], jobs[] }`. `GET /admin/system/metrics` returns request counts and speed per route. `GET /metrics` (Prometheus text, shared token, 404 when not configured) is for a metrics tool, not an app.
