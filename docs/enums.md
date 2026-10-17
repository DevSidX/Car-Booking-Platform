# Frozen enums (provisional until D1 is confirmed)

Enum values are part of the API contract. Changes must be communicated to all app developers immediately.

## Roles
`CUSTOMER`, `DRIVER`, `OPS`, `SUPPORT`, `FINANCE`, `SAFETY_ADMIN`, `CONFIG_ADMIN`, `SUPER_ADMIN`
(P0–P3 use only `CUSTOMER`, `DRIVER`, and an admin role; the finer roles arrive in Phase 7.)

## Account status
`ACTIVE`, `SUSPENDED`, `DELETED`

## Driver approval status
`PENDING`, `APPROVED`, `REJECTED`, `SUSPENDED`

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
