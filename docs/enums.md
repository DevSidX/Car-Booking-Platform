# Frozen enums (provisional until D1 is confirmed)

Enum values are part of the API contract. Changes must be communicated to all app developers immediately.

## Roles
`CUSTOMER`, `DRIVER`, `OPS`, `SUPPORT`, `FINANCE`, `SAFETY_ADMIN`, `CONFIG_ADMIN`, `SUPER_ADMIN`
Self-signup is limited to `CUSTOMER` and `DRIVER`; admin roles are created by seed only.
Phase 1 permissions: driver/vehicle review = `OPS`, `SUPER_ADMIN`; cab categories = `CONFIG_ADMIN`, `SUPER_ADMIN`; audit logs = `SUPER_ADMIN`. The rest arrive in Phase 7.

## Document types / statuses
Types: `DRIVING_LICENCE`, `VEHICLE_RC`, `INSURANCE`, `PERMIT`, `ID_PROOF`, `PROFILE_PHOTO`. Status: `PENDING`, `APPROVED`, `REJECTED`.

## Vehicle verification
`PENDING`, `VERIFIED`, `REJECTED`

## Account status
`ACTIVE`, `SUSPENDED`, `DELETED`

## Driver approval status
`PENDING`, `NEEDS_RESUBMISSION`, `APPROVED`, `REJECTED`, `SUSPENDED`

Admin decisions (`PATCH /admin/drivers/:id/approval`) and allowed source states:
| Decision | Result | Allowed from |
|---|---|---|
| APPROVE | APPROVED | PENDING, NEEDS_RESUBMISSION, SUSPENDED |
| REJECT | REJECTED | PENDING, NEEDS_RESUBMISSION |
| REQUEST_RESUBMISSION | NEEDS_RESUBMISSION | PENDING |
| SUSPEND | SUSPENDED | APPROVED |

A reason is required for every decision except APPROVE.

## Driver online status
`ONLINE`, `OFFLINE`

## Booking / ride status (Spec B)
`REQUESTED` → `DISPATCHING` → `DRIVER_ASSIGNED` → `DRIVER_ARRIVING` → `DRIVER_ARRIVED` → `IN_PROGRESS` → `COMPLETED`

Other: `CANCELLED` (with `cancellationActor` = `CUSTOMER` | `DRIVER` | `SYSTEM` | `ADMIN` and a reason code),
`NO_DRIVER_FOUND`, `NO_SHOW`, `INCIDENT_REVIEW`.

Allowed transitions:
| From | To |
|---|---|
| REQUESTED | DISPATCHING, CANCELLED |
| DISPATCHING | DRIVER_ASSIGNED, NO_DRIVER_FOUND, CANCELLED |
| DRIVER_ASSIGNED | DRIVER_ARRIVING, CANCELLED |
| DRIVER_ARRIVING | DRIVER_ARRIVED, CANCELLED |
| DRIVER_ARRIVED | IN_PROGRESS, CANCELLED, NO_SHOW |
| IN_PROGRESS | COMPLETED, INCIDENT_REVIEW |
| COMPLETED, CANCELLED, NO_DRIVER_FOUND | terminal |

## Payment status (separate from ride status)
`NOT_DUE`, `DUE`, `PROCESSING`, `PAID`, `FAILED`, `PARTIALLY_PAID`, `DISPUTED`, `REFUND_PENDING`, `REFUNDED`, `WRITTEN_OFF`
Cash flow adds `PAID_PENDING_RECONCILIATION` (Spec B §8.4); to be reconciled with the list above in Phase 6.

## Payment method
`CASH`, `ONLINE` (provider `RAZORPAY`)

## Dispatch offer status
`PENDING`, `ACCEPTED`, `REJECTED`, `EXPIRED`, `WITHDRAWN`

## Ride type
`INSTANT` (MVP). `SCHEDULED`, `RENTAL`, `OUTSTATION` later.

## Open conflicts to resolve with the lead
- Spec A: `SEARCHING`, `CANCELLED_BY_CUSTOMER|DRIVER|SYSTEM`. Spec B: `DISPATCHING`, single `CANCELLED`. This file follows B.
- `PAID_PENDING_RECONCILIATION` appears only in a Spec B example, not in its payment-state table.

## Booking transitions added in Phase 3
Retry of a failed search: `NO_DRIVER_FOUND -> DISPATCHING` (OPS/SUPER_ADMIN, `POST /bookings/:id/dispatch/retry`).
Cancel is allowed from REQUESTED, DISPATCHING, DRIVER_ASSIGNED, DRIVER_ARRIVING, DRIVER_ARRIVED only (never IN_PROGRESS).
Cancellation reason codes: customer `CHANGED_MIND | BOOKED_BY_MISTAKE | WAIT_TOO_LONG | DRIVER_ASKED_TO_CANCEL | OTHER`; driver `CUSTOMER_NOT_REACHABLE | WRONG_PICKUP | VEHICLE_ISSUE | PERSONAL_EMERGENCY | OTHER`.
The source of truth is `backend/src/modules/bookings/stateMachine.ts`.

## Offer status
`PENDING`, `ACCEPTED`, `REJECTED`, `EXPIRED`, `WITHDRAWN`

## Phase 5 additions
- Booking `DRIVER_ASSIGNED | DRIVER_ARRIVING | DRIVER_ARRIVED -> DISPATCHING` (a driver cancelled and the rider is re-offered; max 2 times), `DRIVER_ARRIVED -> NO_SHOW` (driver, after the policy wait, at the pickup).
- Fee: `type` CANCELLATION | NO_SHOW; `status` DUE | WAIVED. A booking with a DUE fee has `paymentStatus: DUE` and no fare; Phase 6 collects it.
- Driver document statuses: `PENDING | APPROVED | REJECTED | EXPIRED | SUPERSEDED`. Required types: `DRIVING_LICENCE`, `VEHICLE_RC`, `INSURANCE`, `ID_PROOF`.
- Presence eligibility issue code `DOCUMENTS_INVALID`.
- Realtime `ride:update` kinds: `STOP_ARRIVED | STOP_DEPARTED | DESTINATION_REQUESTED | DESTINATION_ACCEPTED | DESTINATION_DECLINED | FEE_WAIVED`.
- Push types added: `ride.no_show`, `ride.driver_cancelled`, `ride.destination_requested|accepted|declined`, `booking.fee_waived`, `document.expiring`, `document.expired`.

## Phase 6 additions
- Booking `paymentStatus` in use: `NOT_DUE` -> `DUE` (ride completed / fee created) -> `PROCESSING` (online payment under way) -> `PAID`; `FAILED` (payment failed, payable again), `DISPUTED`, `WRITTEN_OFF`, `REFUND_PENDING`, `REFUNDED`. `PARTIALLY_PAID` is not used yet.
- Payment attempt status: `CREATED | PAID | FAILED | EXPIRED`. Refund status: `REQUESTED | PROCESSED | FAILED`.
- Settlement status: `DRAFT | APPROVED | PAID | CANCELLED`.
- Ledger kinds: `RIDE_ACCRUAL, FEE_ACCRUAL, ONLINE_PAYMENT, CASH_COLLECTED, CASH_DEPOSIT, SETTLEMENT_NET, SETTLEMENT_PAYOUT, REFUND, WRITE_OFF, FEE_WAIVER`.
- Ledger accounts: `GATEWAY, PLATFORM_BANK, COMMISSION, REFUNDS, WRITE_OFFS, WAIVED_FEES, RIDER_RECEIVABLE:<userId>, DRIVER_PAYABLE:<driverId>, DRIVER_CASH:<driverId>`. Debit positive, credit negative; every transaction sums to zero.
- Presence eligibility issue `CASH_LIMIT_EXCEEDED`.

## Phase 7 additions
- Feature flag keys: `SOS | TRIP_SHARING | SUPPORT_TICKETS | RATINGS | COUPONS`. A flag has `enabled` and optional `roles` (empty = everyone). Staff roles that may change flags: `CONFIG_ADMIN`, `SUPER_ADMIN`.
- Staff roles that may be created: `OPS | SUPPORT | FINANCE | SAFETY_ADMIN | CONFIG_ADMIN | SUPER_ADMIN` (never `CUSTOMER` or `DRIVER`).
- Safety incident `status`: `OPEN | ACKNOWLEDGED | RESOLVED`; `outcome`: `FALSE_ALARM | ASSISTED | POLICE_INFORMED | OTHER`. Only one OPEN incident per person per ride.
- Support ticket `category`: `FARE_DISPUTE | PAYMENT_ISSUE | DRIVER_BEHAVIOUR | RIDER_BEHAVIOUR | LOST_ITEM | SAFETY_CONCERN | APP_PROBLEM | OTHER`; `status`: `OPEN | IN_PROGRESS | WAITING_USER | RESOLVED | CLOSED`; `priority`: `LOW | NORMAL | HIGH` (a safety concern starts HIGH); `outcome`: `REFUNDED | FEE_WAIVED | WARNING_ISSUED | NO_ACTION | ESCALATED | OTHER`. `REFUNDED` and `FEE_WAIVED` are accepted only when the ticket is about a ride and that ride really has a refund (REQUESTED or PROCESSED) or a WAIVED fee; otherwise `422` with `fieldErrors[0].field = "outcome"`. Finance / operations do the refund or waiver with their own endpoints first.
- Rating `stars` 1-5. Rider-to-driver tags: `POLITE | CLEAN_CAR | SAFE_DRIVING | GOOD_NAVIGATION | ON_TIME | RUDE | UNSAFE_DRIVING | DIRTY_CAR | LONG_ROUTE`. Driver-to-rider tags: `POLITE | ON_TIME | RUDE | LATE | MESSY`. `GET /rides/{id}/rating` returns the tags allowed for the caller.
- Coupon `type`: `PERCENT` (value in basis points, 1000 = 10%) | `FLAT` (value in paise). Optional `maxDiscountPaise`, `minFarePaise`, `maxRedemptions`, `perUserLimit` (default 1), `zoneIds`, `categoryIds`. Codes are upper-cased.
- Receipt line code `DISCOUNT` (negative amount, `detail` = coupon code). Booking/ride show `grossFarePaise`, `discountPaise`, `finalFarePaise` (= gross - discount; what the rider pays).
- Ledger account `PROMOTIONS` (coupon discounts paid by the platform).
- Export kinds: `rides | payments | settlements | ledger` (`.csv` suffix optional).
- Push types added: `safety.sos`, `safety.sos_escalated` (staff), `support.update`.
