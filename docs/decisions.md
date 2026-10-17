# Decision log

Status: **PROVISIONAL** = default assumed by the engineer, awaiting lead confirmation. **LOCKED** = confirmed.

| # | Decision | Status | Notes |
|---|---|---|---|
| D1 | Spec B (Technical Spec v1.0) naming and structure is the API contract; Spec A's 2-day core is the first milestone | PROVISIONAL | Names differ between specs (see CONTEXT.md §4) |
| D2 | Backend: Node 20, Express 5, TypeScript, modular monolith | LOCKED by spec | Do not split into services until scale demands |
| D3 | Database: MongoDB (replica set for transactions) via Mongoose | LOCKED by spec | |
| D4 | Redis = coordination only (presence, geo, dispatch cache, BullMQ). Durable state lives in MongoDB | LOCKED by spec | |
| D5 | Package manager: npm | PROVISIONAL | |
| D6 | Login: phone OTP for customers/drivers | PROVISIONAL | Admin login method undecided |
| D7 | Pilot city: Delhi, currency INR | PROVISIONAL | |
| D8 | Money: integer paise. Time: UTC ISO-8601. Coordinates stored as GeoJSON `[lng, lat]`; API uses `{lat, lng}` objects | LOCKED by spec | |
| D9 | Ride state and payment state are separate state machines | LOCKED by spec | |
| D10 | Driver assignment via atomic conditional update; loser gets `409 RIDE_ALREADY_ASSIGNED` | LOCKED by spec | |
| D11 | Idempotency via `Idempotency-Key` header (Spec B), not a body field | PROVISIONAL | follows D1 |
| D12 | Provider adapters (maps, SMS, push, payments, storage) behind interfaces; mocks allowed only when `NODE_ENV != production` | LOCKED | Mocks never report payment success |
| D13 | Health endpoints: `/api/v1/health/live`, `/api/v1/health/ready` | PROVISIONAL | follows D1 |
| D14 | Logging: pino, JSON, secrets/OTPs/tokens redacted, request id on every request | LOCKED | |
| D15 | `express-rate-limit` default in-memory store for now; move to Redis store before multi-instance deploy | PROVISIONAL | |

## Open items (need lead / finance / legal)
See the question list in the project hand-off. Not blocking P0.
Payment-after-ride default risk, driver earnings timing, unpaid-balance policy and KYC rules must be
decided before Phase 6 / pilot.
