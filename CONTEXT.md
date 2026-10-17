# Cab Booking Platform: Project Context & Progress

> Living document. Update after every meaningful step. Last updated: 2026-10-17.

## 1. Project summary
Uber/Ola-style cab booking platform with four deliverables:
- **backend/**: Node.js + Express + TypeScript modular monolith (MongoDB/Mongoose, Redis, BullMQ, Socket.IO)
- **customer-app/**: React Native + TS (owner/timing TBD)
- **driver-app/**: React Native + TS (owner/timing TBD)
- **admin-panel/**: Next.js + TS (calls admin APIs only)

Integrations (behind adapter interfaces, mocks first): Google Maps, Razorpay, FCM, SMS/OTP provider, object storage (R2).

## 2. Source specs
Two specs were provided (to be saved into `docs/`):
- **Spec A**: "Backend Developer Specification": 2-day core API target + module blueprint (M01–M17, P0/P1/P2).
- **Spec B**: "Technical Specification v1.0": full blueprint (30 modules M01–M30, ~150 endpoints, state machines, ledger, payments, Socket.IO events, QA plan, phases P0–P7).

**Relationship:** A is a slice of B. Plan: use **B's naming/structure** as the frozen contract and implement only the P0 subset first (A's Day-2 core).

## 3. Key architecture decisions (proposed, pending confirmation)
- Modular monolith; route -> validation -> controller -> service -> repository/model.
- MongoDB is the source of truth. Redis is only a coordination layer (presence, geo, dispatch cache).
- Money = integer paise. Timestamps = UTC ISO-8601. GeoJSON = `[lng, lat]`.
- Ride/booking state and payment state are **separate** state machines.
- Atomic driver assignment via conditional update (`status=SEARCHING/DISPATCHING AND driverId=null`), else `409 RIDE_ALREADY_ASSIGNED`.
- Ledger is append-only; corrections are compensating entries.
- Idempotency via `Idempotency-Key` header (booking, payment, refund).
- Never trust the client for fare, role, payment status, ride status or driver eligibility.
- Standard envelopes: `{success, data, meta.requestId}` / `{success:false, error:{code,message,fieldErrors,requestId}}`.

## 4. Naming conflicts between specs (to freeze)
| Concept | Spec A | Spec B (proposed winner) |
|---|---|---|
| Ride states | SEARCHING, CANCELLED_BY_* | DISPATCHING, single CANCELLED (+actor field), NO_DRIVER_FOUND, NO_SHOW |
| Estimate | POST /fare/estimate | POST /fare-quotes |
| Create ride | POST /rides | POST /bookings |
| Accept | POST /rides/:id/accept | POST /ride-offers/:offerId/accept |
| Auth | register/login | otp/request, otp/verify |
| Idempotency | body field | header |
| Presence | PATCH /drivers/availability | POST /drivers/me/presence |
| Health | /health, /ready | /health/live, /health/ready |

## 5. Phases (revised, approved 2026-10-17)
- [x] **P0 Foundation** (done except: Docker-backed readiness check unverified, CI unrun, specs not saved verbatim): specs in docs/, freeze contract (names, enums, envelopes, errors), decisions.md, .gitignore, docker-compose (Mongo replica set + Redis), backend scaffold (TS, config validation, logger, request IDs, error handler, health, graceful shutdown), provider adapter interfaces + mocks, CI, staging plan, observability baseline, OpenAPI skeleton
- [ ] **P1 Accounts**: OTP auth, sessions, RBAC, customer profile, driver onboarding/KYC, vehicles, categories, admin approval, audit baseline
- [ ] **P2 Booking & pricing**: service zones, seed + config endpoints, maps adapter, fare config, quote engine, booking with idempotency
- [ ] **P3 Dispatch & ride lifecycle** (*Day-2 demo*): presence/GPS, matching, offers, atomic accept, OTP start, complete, cash + DUE stub, basic cancel, history, critical tests
- [ ] **P3.5 Handover**: Postman, OpenAPI, staging URL, mobile devs start integrating (parallel from here), minimal admin for approvals/categories/zones
- [ ] **P4 Realtime & notifications**: Socket.IO, tracking, FCM, location retention job
- [ ] **P5 Ride extras**: waiting, stops, destination change, cancellation fees/no-show, receipts, driver document expiry jobs
- [ ] **P6 Payments & ledger**: Razorpay, webhooks, cash reconciliation, unpaid balance/restrictions, ledger, settlements
- [ ] **P7 Ops, safety, admin**: admin APIs + full Next.js panel, support, SOS, ratings, coupons, flags, full RBAC
- [ ] **P8 Hardening & pilot**: regression gate (Spec A's 11 minimum tests re-run), security, load, reconciliation, runbook, go/no-go
- [ ] **P9 Expansion**: scheduled, corporate, rentals, outstation, analytics

**Parallel product track (non-code, long lead time):** KYC/compliance review, staffed SOS response plan, finance/ledger/payout policy, Razorpay merchant approval, Google Maps + Firebase accounts, location retention policy.

Per-module rule: lint + typecheck + build + tests after each module; one commit per module; keep Postman/OpenAPI/enums in sync. Each phase's tests are written in that phase (not deferred to P8). After each phase, report work done in bullet points to the user.

## 6. Go/no-go rule
No public launch if payment, authorization, ride-assignment or location-privacy tests fail.

## 7. Open decisions (need user answers)
1. Login mechanism: phone OTP (needs SMS provider) vs email/password vs both
2. Local infra: Docker available? MongoDB replica set (needed for transactions) / Atlas?
3. Apps/admin: in this monorepo or separate repos/teams?
4. Package manager: npm / pnpm / yarn
5. Third-party credentials available? (Google Maps, Razorpay test, Firebase). Otherwise mock adapters
6. Region/pilot city: Delhi / India-only (INR)?
7. Adopt Spec B naming as the frozen contract?
8. Day-2 scope = B's P0–P3 slice?
9. Payment policy defaults (pay-after-ride default risk, unpaid-balance blocking, driver earnings timing, cash discrepancy, write-off authority)

## 8. Progress log
- 2026-10-17: Reviewed Spec A and Spec B; produced comparison and phased workflow.
- 2026-10-17: Created top-level folders (each with `.gitkeep`): `backend/`, `customer-app/`, `driver-app/`, `admin-panel/`, `docs/`, `postman/`, `infra/`.
- 2026-10-17: Created this `CONTEXT.md`.
- 2026-10-17: Audited phases against specs; revised phase order (added P3.5, P5 ride extras, CI/staging/observability in P0, parallel mobile integration). User approved.

## 9. Repo layout (current)
```
Car-Booking Platform/
├── backend/        (empty)
├── customer-app/   (empty)
├── driver-app/     (empty)
├── admin-panel/    (empty)
├── docs/           (empty; specs to be added)
├── postman/        (empty)
├── infra/          (empty)
├── CONTEXT.md
├── README.md       (pre-existing)
└── package-lock.json (pre-existing)
```

## 10. Next step
Get answers to open decisions (section 7), then start **P0**.
- 2026-10-17: **P0 completed** (see report). backend scaffold + 16 passing tests; docs/decisions.md, api-contract.md, enums.md, staging-and-observability.md; infra/docker-compose.yml; .github/workflows/ci.yml. Not committed yet.
