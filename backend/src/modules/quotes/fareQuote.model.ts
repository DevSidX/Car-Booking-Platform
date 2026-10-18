import { Schema, model } from 'mongoose';

const pointSchema = new Schema(
  {
    label: { type: String, maxlength: 200 },
    location: {
      type: { type: String, enum: ['Point'], required: true },
      coordinates: { type: [Number], required: true },
    },
  },
  { _id: false },
);

/** A priced, expiring, single-use estimate. The server computed every number in it. */
const fareQuoteSchema = new Schema(
  {
    publicId: { type: String, required: true, unique: true },
    customerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    zoneId: { type: Schema.Types.ObjectId, ref: 'ServiceZone', required: true },
    categoryId: { type: Schema.Types.ObjectId, ref: 'CabCategory', required: true },
    configId: { type: Schema.Types.ObjectId, ref: 'FareConfig', required: true },
    configVersion: { type: Number, required: true },
    pickup: { type: pointSchema, required: true },
    drop: { type: pointSchema, required: true },
    stops: { type: [pointSchema], default: [] },
    // The coupon the rider asked for, frozen as it was when they saw the price.
    coupon: {
      type: new Schema(
        {
          couponId: { type: Schema.Types.ObjectId, ref: 'Coupon', required: true },
          code: { type: String, required: true },
          type: { type: String, enum: ['PERCENT', 'FLAT'], required: true },
          value: { type: Number, required: true },
          maxDiscountPaise: { type: Number },
          minFarePaise: { type: Number },
        },
        { _id: false },
      ),
      default: undefined,
    },
    discountPaise: { type: Number, default: 0 },
    distanceMeters: { type: Number, required: true },
    durationSeconds: { type: Number, required: true },
    breakdown: { type: Schema.Types.Mixed, required: true },
    estimatedTotalPaise: { type: Number, required: true },
    currency: { type: String, default: 'INR' },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date, default: null },
    bookingId: { type: String },
    usedByKey: { type: String },
  },
  { timestamps: true },
);
// Quotes are snapshotted into bookings, so old ones can be purged a week after expiry.
fareQuoteSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 7 * 86400 });

export const FareQuote = model('FareQuote', fareQuoteSchema);
