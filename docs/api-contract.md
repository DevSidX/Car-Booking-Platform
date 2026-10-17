# API contract conventions (v1)

Base path: `/api/v1`. This file is the source of truth for cross-cutting rules. Endpoint-level contracts live in
the OpenAPI spec (`GET /api/v1/openapi.json`) and `postman/`. Breaking changes require a new version and
simultaneous update of the apps.

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
| `NOT_FOUND` | 404 (also used when a resource is not visible to the caller) |
| `CONFLICT` | 409 |
| `RIDE_ALREADY_ASSIGNED` | 409 |
| `RIDE_INVALID_STATE` | 409 |
| `UNPROCESSABLE` | 422 |
| `RATE_LIMITED` | 429 |
| `INTERNAL_ERROR` | 500 |
| `PROVIDER_ERROR` | 502 |
| `SERVICE_UNAVAILABLE` | 503 |

Source: `backend/src/common/errors.ts`. Later phases add domain codes (e.g. `OTP_EXPIRED`, `QUOTE_EXPIRED`,
`PAYMENT_AMOUNT_MISMATCH`) and list them here.

## Status codes
200 read/update · 201 created · 202 accepted async · 400 malformed · 401/403 authn/authz · 404 not found/not visible ·
409 state conflict/duplicate/already assigned · 422 business validation · 429 rate limit · 500/502/503 server/provider.

## Module pattern
`route → validation (zod) → controller → service → repository/model`. No business logic in route handlers.
Every endpoint declares its authorization (role + object ownership).
