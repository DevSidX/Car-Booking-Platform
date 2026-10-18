import type { Actor } from '../../common/actor';
import { AppError } from '../../common/errors';
import { fromPoint } from '../../common/geo';
import { pageMeta } from '../../common/pagination';
import { escapeRegex } from '../../common/zod';
import type { AuditService } from '../audit/audit.service';
import { Session } from '../auth/session.model';
import { Booking, type BookingStatus } from '../bookings/booking.model';
import { BookingEvent } from '../bookings/bookingEvent.model';
import { RideOffer } from '../dispatch/rideOffer.model';
import { DriverDocument } from '../drivers/driverDocument.model';
import { DriverProfile } from '../drivers/driverProfile.model';
import { Ride } from '../rides/ride.model';
import { rideView } from '../rides/rides.views';
import { User } from '../users/user.model';
import { Vehicle } from '../vehicles/vehicle.model';
import { LocationPing } from '../tracking/locationPing.model';
import type { RealtimeBus } from '../../realtime/bus';
import type { Notifier } from '../../realtime/notifier';
import type { LedgerService } from '../ledger/ledger.service';
import { recordEvent } from '../bookings/transitions';
import type {
  BookingListQuery,
  ExpiringDocumentsQuery,
  UserListQuery,
  UserStatusInput,
  WaiveFeeInput,
} from './admin.schemas';

const ACTIVE_BOOKING_STATUSES: BookingStatus[] = [
  'REQUESTED',
  'DISPATCHING',
  'DRIVER_ASSIGNED',
  'DRIVER_ARRIVING',
  'DRIVER_ARRIVED',
  'IN_PROGRESS',
];

type UserLean = {
  _id: { toString(): string };
  role: string;
  phone: string;
  name?: string | null;
  accountStatus: string;
  createdAt: Date;
};

const userRow = (u: UserLean) => ({
  userId: u._id.toString(),
  role: u.role,
  phone: u.phone,
  name: u.name ?? null,
  accountStatus: u.accountStatus,
  createdAt: u.createdAt,
});

export function createAdminService(deps: {
  audit: AuditService;
  now: () => Date;
  bus?: Pick<RealtimeBus, 'disconnectUser'>;
  notifier?: Pick<Notifier, 'rideUpdated'>;
  ledger?: Pick<LedgerService, 'waiveFeeSafe'>;
}) {
  const { audit, now, bus, notifier, ledger } = deps;

  async function countBy(
    model: typeof Booking | typeof DriverProfile,
    field: string,
    match: Record<string, unknown> = {},
  ): Promise<Record<string, number>> {
    const rows = await model.aggregate<{ _id: string; n: number }>([
      { $match: match },
      { $group: { _id: `$${field}`, n: { $sum: 1 } } },
    ]);
    return Object.fromEntries(rows.map((r) => [r._id, r.n]));
  }

  return {
    /* ---------- Users ---------- */

    async listUsers(query: UserListQuery) {
      const { page, limit, role, accountStatus, q } = query;
      const filter: Record<string, unknown> = {};
      if (role) filter['role'] = role;
      if (accountStatus) filter['accountStatus'] = accountStatus;
      if (q) {
        const rx = new RegExp(escapeRegex(q), 'i');
        filter['$or'] = [{ phone: rx }, { name: rx }];
      }
      const [total, rows] = await Promise.all([
        User.countDocuments(filter),
        User.find(filter)
          .sort({ createdAt: -1 })
          .skip((page - 1) * limit)
          .limit(limit)
          .lean(),
      ]);
      return { items: rows.map(userRow), meta: pageMeta(page, limit, total) };
    },

    async userDetail(userId: string) {
      const user = await User.findById(userId).lean();
      if (!user) throw new AppError('NOT_FOUND');
      const [profile, bookingCount, liveSessions] = await Promise.all([
        user.role === 'DRIVER' ? DriverProfile.findOne({ userId: user._id }).lean() : null,
        user.role === 'CUSTOMER' ? Booking.countDocuments({ customerId: user._id }) : null,
        Session.countDocuments({ userId: user._id, revokedAt: null, expiresAt: { $gt: now() } }),
      ]);
      return {
        ...userRow(user),
        phoneVerifiedAt: user.phoneVerifiedAt ?? null,
        liveSessions,
        bookingCount,
        driver: profile
          ? {
              driverId: profile._id.toString(),
              approvalStatus: profile.approvalStatus,
              onlineStatus: profile.onlineStatus,
            }
          : null,
      };
    },

    /**
     * Suspend or reactivate an account. Suspending ends every login session at once. Drivers are
     * handled by the driver-approval workflow instead, so their approval state stays consistent.
     */
    async setUserStatus(actor: Actor, userId: string, input: UserStatusInput) {
      if (userId === actor.userId) {
        throw new AppError('UNPROCESSABLE', 'You cannot change your own account status.');
      }
      const target = await User.findById(userId);
      if (!target) throw new AppError('NOT_FOUND');
      if (target.role === 'DRIVER') {
        throw new AppError('UNPROCESSABLE', 'Use the driver approval decision (SUSPEND/APPROVE).');
      }
      if (target.role !== 'CUSTOMER' && actor.role !== 'SUPER_ADMIN') {
        throw new AppError('FORBIDDEN', 'Only a super admin can change a staff account.');
      }
      if (target.accountStatus === 'DELETED') {
        throw new AppError('UNPROCESSABLE', 'This account has been deleted.');
      }
      if (target.accountStatus === input.status) {
        throw new AppError('CONFLICT', `Account is already ${input.status}.`);
      }
      const previous = target.accountStatus;
      // Conditional on the status we read, so two admins acting at once cannot both "win".
      const updated = await User.findOneAndUpdate(
        { _id: target._id, accountStatus: previous },
        { accountStatus: input.status },
        { returnDocument: 'after' },
      );
      if (!updated) throw new AppError('CONFLICT', 'Account changed; reload and retry.');
      if (input.status === 'SUSPENDED') {
        await Session.updateMany({ userId: target._id, revokedAt: null }, { revokedAt: now() });
        bus?.disconnectUser(userId, 'SUSPENDED'); // live connections end now, not at the next check
      }
      await audit.record(actor, {
        action: input.status === 'SUSPENDED' ? 'USER_SUSPENDED' : 'USER_REACTIVATED',
        targetType: 'User',
        targetId: userId,
        metadata: { reason: input.reason, from: previous, to: input.status },
      });
      return userRow(updated);
    },

    /* ---------- Bookings ---------- */

    async listBookings(query: BookingListQuery) {
      const { page, limit, status, paymentStatus, customerId, driverId, q, from, to } = query;
      const filter: Record<string, unknown> = {};
      if (status) filter['status'] = status;
      if (paymentStatus) filter['paymentStatus'] = paymentStatus;
      if (customerId) filter['customerId'] = customerId;
      if (driverId) filter['assignedDriverId'] = driverId;
      if (q) filter['publicId'] = new RegExp(`^${escapeRegex(q)}`);
      if (from || to) {
        filter['requestedAt'] = { ...(from && { $gte: from }), ...(to && { $lte: to }) };
      }
      const [total, rows] = await Promise.all([
        Booking.countDocuments(filter),
        Booking.find(filter)
          .sort({ requestedAt: -1 })
          .skip((page - 1) * limit)
          .limit(limit)
          .lean(),
      ]);
      const customers = await User.find({ _id: { $in: rows.map((b) => b.customerId) } })
        .select('name phone')
        .lean();
      const byId = new Map(customers.map((c) => [c._id.toString(), c]));
      return {
        items: rows.map((b) => {
          const c = byId.get(b.customerId.toString());
          return {
            bookingId: b.publicId,
            rideId: b.rideId ?? null,
            status: b.status,
            paymentStatus: b.paymentStatus ?? 'NOT_DUE',
            paymentMethod: b.paymentMethod,
            customer: {
              userId: b.customerId.toString(),
              name: c?.name ?? null,
              phone: c?.phone ?? null,
            },
            driverId: b.assignedDriverId?.toString() ?? null,
            pickupLabel: b.pickup.label ?? null,
            dropLabel: b.drop.label ?? null,
            estimatedFarePaise: b.estimatedFarePaise,
            finalFarePaise: b.finalFarePaise ?? null,
            requestedAt: b.requestedAt,
          };
        }),
        meta: pageMeta(page, limit, total),
      };
    },

    /** Everything ops needs to answer "what happened to this booking?". */
    async bookingDetail(actor: Actor, bookingPublicId: string) {
      const booking = await Booking.findOne({ publicId: bookingPublicId }).lean();
      if (!booking) throw new AppError('NOT_FOUND');
      const [customer, ride, events, offers] = await Promise.all([
        User.findById(booking.customerId).select('name phone').lean(),
        Ride.findOne({ bookingId: booking._id }).lean(),
        BookingEvent.find({ bookingId: booking._id }).sort({ at: 1 }).lean(),
        RideOffer.find({ bookingId: booking._id }).sort({ round: 1, rank: 1 }).lean(),
      ]);
      // Viewing a rider's contact details is a sensitive read, so it is audited.
      await audit.record(actor, {
        action: 'BOOKING_VIEWED',
        targetType: 'Booking',
        targetId: bookingPublicId,
      });
      return {
        bookingId: booking.publicId,
        status: booking.status,
        paymentStatus: booking.paymentStatus ?? 'NOT_DUE',
        paymentMethod: booking.paymentMethod,
        customer: {
          userId: booking.customerId.toString(),
          name: customer?.name ?? null,
          phone: customer?.phone ?? null,
        },
        categoryId: booking.categoryId.toString(),
        zoneId: booking.zoneId.toString(),
        pickup: { ...fromPoint(booking.pickup.location!), label: booking.pickup.label ?? null },
        drop: { ...fromPoint(booking.drop.location!), label: booking.drop.label ?? null },
        estimatedFarePaise: booking.estimatedFarePaise,
        finalFarePaise: booking.finalFarePaise ?? null,
        fareSnapshot: booking.fareSnapshot,
        finalFare: booking.finalFare ?? null,
        cancellation: booking.cancellation?.actor ? booking.cancellation : null,
        dispatchRound: booking.dispatch?.round ?? 1,
        stops: (booking.stops ?? []).map((st) => ({
          ...fromPoint(st.location!),
          label: st.label ?? null,
        })),
        fee: booking.fee ?? null,
        policy: booking.policy ?? null,
        receiptNumber: booking.receipt?.number ?? null,
        redispatchCount: booking.redispatchCount ?? 0,
        previousDrivers: (booking.previousDrivers ?? []).map((p) => ({
          driverId: p.driverId.toString(),
          cancelledAt: p.cancelledAt,
          reasonCode: p.reasonCode ?? null,
        })),
        fareAmendments: booking.fareAmendments ?? [],
        pendingDestinationChange: booking.destinationChange
          ? {
              requestId: booking.destinationChange.requestId,
              expiresAt: booking.destinationChange.expiresAt,
              estimatedTotalPaise: booking.destinationChange.estimatedTotalPaise,
            }
          : null,
        requestedAt: booking.requestedAt,
        ride: ride ? await rideView('ADMIN', booking, ride) : null,
        events: events.map((e) => ({
          type: e.type,
          fromStatus: e.fromStatus ?? null,
          toStatus: e.toStatus ?? null,
          actorType: e.actorType,
          actorId: e.actorId ?? null,
          metadata: e.metadata ?? null,
          at: e.at,
        })),
        offers: offers.map((o) => ({
          offerId: o.publicId,
          driverId: o.driverId.toString(),
          round: o.round,
          rank: o.rank ?? null,
          status: o.status,
          pickupDistanceMeters: o.pickupDistanceMeters ?? null,
          pickupEtaSeconds: o.pickupEtaSeconds ?? null,
          expiresAt: o.expiresAt,
          respondedAt: o.respondedAt ?? null,
          rejectReason: o.rejectReason ?? null,
        })),
      };
    },

    /** The sampled route a driver took during a ride, for disputes. Location data: every read is audited. */
    async rideTrail(actor: Actor, ridePublicId: string) {
      const ride = await Ride.findOne({ publicId: ridePublicId }).select('bookingId').lean();
      if (!ride) throw new AppError('NOT_FOUND');
      const pings = await LocationPing.find({ bookingId: ride.bookingId })
        .sort({ recordedAt: 1 })
        .limit(2000)
        .lean();
      await audit.record(actor, {
        action: 'RIDE_TRAIL_VIEWED',
        targetType: 'Ride',
        targetId: ridePublicId,
      });
      return {
        rideId: ridePublicId,
        count: pings.length,
        points: pings.map((p) => ({
          ...fromPoint(p.location!),
          recordedAt: p.recordedAt,
          bookingStatus: p.bookingStatus ?? null,
          accuracyMeters: p.accuracyMeters ?? null,
          headingDegrees: p.headingDegrees ?? null,
        })),
      };
    },

    /** Waive a cancellation or no-show fee (e.g. after a complaint). Audited, and the rider is told. */
    async waiveFee(actor: Actor, bookingPublicId: string, input: WaiveFeeInput) {
      const t = now();
      const updated = await Booking.findOneAndUpdate(
        { publicId: bookingPublicId, 'fee.status': 'DUE' },
        {
          'fee.status': 'WAIVED',
          'fee.waivedBy': actor.userId,
          'fee.waivedAt': t,
          'fee.waivedReason': input.reason,
          paymentStatus: 'NOT_DUE',
        },
        { returnDocument: 'after' },
      );
      if (!updated) {
        const b = await Booking.findOne({ publicId: bookingPublicId }).select('fee').lean();
        if (!b) throw new AppError('NOT_FOUND');
        throw new AppError(
          'CONFLICT',
          b.fee ? 'This fee has already been waived.' : 'This booking has no fee to waive.',
        );
      }
      await audit.record(actor, {
        action: 'booking.fee.waive',
        targetType: 'Booking',
        targetId: bookingPublicId,
        metadata: {
          amountPaise: updated.fee?.amountPaise,
          type: updated.fee?.type,
          reason: input.reason,
        },
      });
      const eventId = await recordEvent({
        bookingId: updated._id,
        type: 'FEE_WAIVED',
        actorType: 'ADMIN',
        actorId: actor.userId,
        at: t,
        metadata: { reason: input.reason },
      });
      await ledger?.waiveFeeSafe(updated._id);
      await notifier?.rideUpdated(updated._id, { eventId, kind: 'FEE_WAIVED', toRider: true });
      return {
        bookingId: bookingPublicId,
        fee: {
          type: updated.fee?.type,
          amountPaise: updated.fee?.amountPaise,
          status: updated.fee?.status,
        },
      };
    },

    /** Approved documents about to expire, and those that already have: who needs to renew. */
    async expiringDocuments(query: ExpiringDocumentsQuery) {
      const { page, limit, days } = query;
      const horizon = new Date(now().getTime() + days * 86_400_000);
      const filter: Record<string, unknown> = {
        $or: [
          { status: 'EXPIRED' },
          { status: 'APPROVED', expiresAt: { $ne: null, $lte: horizon } },
        ],
      };
      const [total, rows] = await Promise.all([
        DriverDocument.countDocuments(filter),
        DriverDocument.find(filter)
          .sort({ expiresAt: 1 })
          .skip((page - 1) * limit)
          .limit(limit)
          .lean(),
      ]);
      const profiles = await DriverProfile.find({ _id: { $in: rows.map((d) => d.driverId) } })
        .select('userId')
        .lean();
      const users = await User.find({ _id: { $in: profiles.map((p) => p.userId) } })
        .select('name phone')
        .lean();
      const userOf = new Map(users.map((u) => [u._id.toString(), u]));
      const profileOf = new Map(profiles.map((p) => [p._id.toString(), p]));
      return {
        items: rows.map((d) => {
          const u = userOf.get(profileOf.get(d.driverId.toString())?.userId.toString() ?? '');
          return {
            documentId: d._id.toString(),
            driverId: d.driverId.toString(),
            driverName: u?.name ?? null,
            driverPhone: u?.phone ?? null,
            type: d.type,
            status: d.status,
            expiresAt: d.expiresAt ?? null,
          };
        }),
        meta: pageMeta(page, limit, total),
      };
    },

    /* ---------- Dashboard ---------- */

    async dashboard() {
      const since = new Date(now().getTime() - 24 * 3600_000);
      const [
        activeBookings,
        last24h,
        driversByApproval,
        driversOnline,
        driversAwaitingReview,
        documentsAwaitingReview,
        vehiclesAwaitingVerification,
        customers,
        awaitingRetry,
        documentsExpiringSoon,
        documentsExpired,
      ] = await Promise.all([
        Booking.countDocuments({ status: { $in: ACTIVE_BOOKING_STATUSES } }),
        countBy(Booking, 'status', { requestedAt: { $gte: since } }),
        countBy(DriverProfile, 'approvalStatus'),
        DriverProfile.countDocuments({ approvalStatus: 'APPROVED', onlineStatus: 'ONLINE' }),
        DriverProfile.countDocuments({
          approvalStatus: 'PENDING',
          applicationSubmittedAt: { $ne: null },
        }),
        DriverDocument.countDocuments({ status: 'PENDING' }),
        Vehicle.countDocuments({ verificationStatus: 'PENDING' }),
        User.countDocuments({ role: 'CUSTOMER', accountStatus: 'ACTIVE' }),
        Booking.countDocuments({ status: 'NO_DRIVER_FOUND' }),
        DriverDocument.countDocuments({
          status: 'APPROVED',
          expiresAt: { $ne: null, $lte: new Date(now().getTime() + 30 * 86_400_000) },
        }),
        DriverDocument.countDocuments({ status: 'EXPIRED' }),
      ]);
      return {
        generatedAt: now(),
        bookings: { active: activeBookings, last24hByStatus: last24h, awaitingRetry },
        drivers: { byApprovalStatus: driversByApproval, onlineNow: driversOnline },
        reviewQueue: {
          driverApplications: driversAwaitingReview,
          documents: documentsAwaitingReview,
          vehicles: vehiclesAwaitingVerification,
          documentsExpiringSoon,
          documentsExpired,
        },
        customers: { active: customers },
      };
    },
  };
}

export type AdminService = ReturnType<typeof createAdminService>;
