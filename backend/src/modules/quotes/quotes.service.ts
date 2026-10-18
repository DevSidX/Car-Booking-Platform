import type { Types } from 'mongoose';
import type { Role } from '../../common/enums';
import { AppError } from '../../common/errors';
import { fromPoint, toPoint } from '../../common/geo';
import { publicId } from '../../common/ids';
import type { MapsProvider } from '../../providers';
import { CabCategory } from '../categories/cabCategory.model';
import { calculateFare } from '../pricing/fare';
import { FareConfig } from '../pricing/fareConfig.model';
import type { PricingService } from '../pricing/pricing.service';
import { isWithinOperatingHours, type ZonesService } from '../zones/zones.service';
import type { CouponsService } from '../coupons/coupons.service';
import { FareQuote } from './fareQuote.model';
import { routeThrough } from './route';
import type { CreateQuoteInput, ServiceabilityQuery } from './quotes.schemas';

export const QUOTE_TTL_MS = 10 * 60_000;
/** Trips shorter than this are almost certainly a mistake; longer ones are out of MVP scope. */
export const MIN_TRIP_METERS = 100;
export const MAX_TRIP_METERS = 150_000;

type QuoteDoc = {
  publicId: string;
  categoryId: Types.ObjectId;
  configVersion: number;
  pickup: { label?: string | null; location: { coordinates: number[] } };
  drop: { label?: string | null; location: { coordinates: number[] } };
  stops?: { label?: string | null; location: { coordinates: number[] } }[];
  distanceMeters: number;
  durationSeconds: number;
  breakdown: unknown;
  currency?: string | null;
  expiresAt: Date;
  usedAt?: Date | null;
  coupon?: { code: string } | null;
  discountPaise?: number | null;
  estimatedTotalPaise?: number;
};

export function quoteView(raw: unknown, now: Date) {
  const q = raw as QuoteDoc;
  const status = q.usedAt ? 'USED' : q.expiresAt.getTime() <= now.getTime() ? 'EXPIRED' : 'ACTIVE';
  return {
    quoteId: q.publicId,
    status,
    currency: q.currency ?? 'INR',
    categoryId: q.categoryId.toString(),
    pickup: { ...fromPoint(q.pickup.location), label: q.pickup.label ?? null },
    drop: { ...fromPoint(q.drop.location), label: q.drop.label ?? null },
    stops: (q.stops ?? []).map((s) => ({ ...fromPoint(s.location), label: s.label ?? null })),
    estimatedDistanceMeters: q.distanceMeters,
    estimatedDurationSeconds: q.durationSeconds,
    breakdown: q.breakdown,
    // What the rider would pay after their coupon (the real discount is set when the ride ends).
    coupon: q.coupon ? { code: q.coupon.code, discountPaise: q.discountPaise ?? 0 } : null,
    estimatedPayablePaise: (q.estimatedTotalPaise ?? 0) - (q.discountPaise ?? 0),
    configVersion: q.configVersion,
    expiresAt: q.expiresAt,
  };
}

export function createQuotesService(deps: {
  zones: ZonesService;
  pricing: PricingService;
  maps: MapsProvider;
  now: () => Date;
  coupons: Pick<CouponsService, 'evaluate'>;
}) {
  const { zones, pricing, maps, now, coupons } = deps;

  /** Is this point inside an active zone that is open right now? */
  async function checkPoint(lat: number, lng: number) {
    const zone = await zones.locate(lat, lng);
    if (!zone) return { serviceable: false as const, reason: 'OUTSIDE_SERVICE_AREA' as const };
    if (!isWithinOperatingHours(zone.operatingHours, now())) {
      return { serviceable: false as const, reason: 'OUTSIDE_OPERATING_HOURS' as const };
    }
    return { serviceable: true as const, zone };
  }

  async function build(customerId: string, input: CreateQuoteInput, role: Role = 'CUSTOMER') {
    const category = await CabCategory.findOne({ _id: input.categoryId, active: true }).lean();
    if (!category) {
      throw new AppError('UNPROCESSABLE', undefined, [
        { field: 'categoryId', message: 'Unknown or inactive category' },
      ]);
    }
    const stops = input.stops ?? [];
    const [pickup, drop, ...stopChecks] = await Promise.all([
      checkPoint(input.pickup.lat, input.pickup.lng),
      checkPoint(input.drop.lat, input.drop.lng),
      ...stops.map((s) => checkPoint(s.lat, s.lng)),
    ]);
    if (!pickup.serviceable) {
      throw new AppError('NOT_SERVICEABLE', `Pickup is not serviceable (${pickup.reason}).`);
    }
    if (!drop.serviceable) {
      throw new AppError('NOT_SERVICEABLE', `Drop is not serviceable (${drop.reason}).`);
    }
    for (const [i, check] of stopChecks.entries()) {
      if (!check.serviceable) {
        throw new AppError(
          'NOT_SERVICEABLE',
          `Stop ${i + 1} is not serviceable (${check.reason}).`,
        );
      }
    }

    const at = now();
    // Pricing follows the pickup zone.
    const config = await pricing.getActiveConfig(pickup.zone._id, category._id, at);
    if (!config) {
      throw new AppError('NOT_SERVICEABLE', 'This category is not available in the pickup zone.');
    }

    let route;
    try {
      route = await routeThrough(maps, [input.pickup, ...stops, input.drop]);
    } catch {
      throw new AppError('PROVIDER_ERROR', 'Could not compute the route. Please try again.');
    }
    if (route.distanceMeters < MIN_TRIP_METERS) {
      throw new AppError('UNPROCESSABLE', 'Pickup and drop are too close together.');
    }
    if (route.distanceMeters > MAX_TRIP_METERS) {
      throw new AppError('NOT_SERVICEABLE', 'This trip is longer than we currently serve.');
    }

    const breakdown = calculateFare(
      {
        baseFarePaise: config.baseFarePaise,
        perKmPaise: config.perKmPaise,
        perMinutePaise: config.perMinutePaise,
        minimumFarePaise: config.minimumFarePaise,
        roundingMode: (config.roundingMode ?? 'NEAREST_RUPEE') as 'NEAREST_RUPEE' | 'NONE',
      },
      route.distanceMeters,
      route.durationSeconds,
    );

    // A coupon is checked now (so the rider sees the price they will pay) and frozen on the quote.
    const applied = input.couponCode
      ? await coupons.evaluate(role, {
          code: input.couponCode,
          userId: customerId,
          zoneId: pickup.zone._id,
          categoryId: category._id,
          estimatedFarePaise: breakdown.estimatedTotalPaise,
        })
      : null;

    const created = await FareQuote.create({
      publicId: publicId('fq'),
      customerId,
      zoneId: pickup.zone._id,
      categoryId: category._id,
      configId: config._id,
      configVersion: config.version,
      pickup: { label: input.pickup.label, location: toPoint(input.pickup.lat, input.pickup.lng) },
      drop: { label: input.drop.label, location: toPoint(input.drop.lat, input.drop.lng) },
      stops: stops.map((s) => ({ label: s.label, location: toPoint(s.lat, s.lng) })),
      distanceMeters: route.distanceMeters,
      durationSeconds: route.durationSeconds,
      breakdown,
      estimatedTotalPaise: breakdown.estimatedTotalPaise,
      ...(applied ? { coupon: applied.snapshot, discountPaise: applied.discountPaise } : {}),
      expiresAt: new Date(at.getTime() + QUOTE_TTL_MS),
    });
    return created;
  }

  async function findOwned(customerId: string, quoteId: string) {
    // Scoped by customer: someone else's quote is simply "not found".
    const quote = await FareQuote.findOne({ publicId: quoteId, customerId });
    if (!quote) throw new AppError('NOT_FOUND', 'Fare quote not found.');
    return quote;
  }

  return {
    checkPoint,

    async serviceability(query: ServiceabilityQuery) {
      const [pickup, drop] = await Promise.all([
        checkPoint(query.pickupLat, query.pickupLng),
        checkPoint(query.dropLat, query.dropLng),
      ]);
      const side = (r: Awaited<ReturnType<typeof checkPoint>>) =>
        r.serviceable
          ? { serviceable: true, zoneId: r.zone._id.toString(), zoneName: r.zone.name }
          : { serviceable: false, reason: r.reason };

      let categories: { categoryId: string; code: string; name: string; available: boolean }[] = [];
      if (pickup.serviceable) {
        const [cats, configs] = await Promise.all([
          CabCategory.find({ active: true }).sort({ displayOrder: 1, name: 1 }).lean(),
          FareConfig.distinct('categoryId', {
            zoneId: pickup.zone._id,
            effectiveFrom: { $lte: now() },
          }),
        ]);
        const priced = new Set(configs.map((c) => c.toString()));
        categories = cats.map((c) => ({
          categoryId: c._id.toString(),
          code: c.code,
          name: c.name,
          available: priced.has(c._id.toString()),
        }));
      }
      return {
        serviceable: pickup.serviceable && drop.serviceable,
        pickup: side(pickup),
        drop: side(drop),
        categories,
      };
    },

    async createQuote(customerId: string, input: CreateQuoteInput) {
      const quote = await build(customerId, input);
      return quoteView(quote, now());
    },

    async getQuote(customerId: string, quoteId: string) {
      return quoteView(await findOwned(customerId, quoteId), now());
    },

    /** Re-price the same trip (e.g. after expiry) as a brand-new quote. */
    async refreshQuote(customerId: string, quoteId: string) {
      const old = await findOwned(customerId, quoteId);
      if (old.usedAt) throw new AppError('QUOTE_ALREADY_USED');
      const quote = await build(customerId, {
        pickup: {
          ...fromPoint(old.pickup.location!),
          ...(old.pickup.label ? { label: old.pickup.label } : {}),
        },
        drop: {
          ...fromPoint(old.drop.location!),
          ...(old.drop.label ? { label: old.drop.label } : {}),
        },
        stops: (old.stops ?? []).map((s) => ({
          ...fromPoint(s.location!),
          ...(s.label ? { label: s.label } : {}),
        })),
        categoryId: old.categoryId.toString(),
        ...(old.coupon ? { couponCode: old.coupon.code } : {}),
      });
      return quoteView(quote, now());
    },

    /** Read a quote for booking validation without consuming it. */
    findOwned,

    /**
     * Atomically mark a quote used. Only one caller can win, so a quote can never back two bookings.
     * Returns the consumed quote.
     */
    async consume(customerId: string, quoteId: string, bookingId: string, idempotencyKey: string) {
      const at = now();
      const consumed = await FareQuote.findOneAndUpdate(
        { publicId: quoteId, customerId, usedAt: null, expiresAt: { $gt: at } },
        { usedAt: at, bookingId, usedByKey: idempotencyKey },
        { returnDocument: 'after' },
      );
      if (consumed) return consumed;
      const quote = await FareQuote.findOne({ publicId: quoteId, customerId }).lean();
      if (!quote) throw new AppError('NOT_FOUND', 'Fare quote not found.');
      if (quote.usedAt) throw new AppError('QUOTE_ALREADY_USED');
      throw new AppError('QUOTE_EXPIRED');
    },

    /** Compensating action if booking creation fails after the quote was consumed. */
    async release(quoteId: string) {
      await FareQuote.updateOne(
        { publicId: quoteId },
        { usedAt: null, $unset: { bookingId: 1, usedByKey: 1 } },
      );
    },
  };
}

export type QuotesService = ReturnType<typeof createQuotesService>;
