import { Schema, model } from 'mongoose';

export const PaymentStatuses = ['CREATED', 'PAID', 'FAILED', 'EXPIRED'] as const;
export type PaymentStatus = (typeof PaymentStatuses)[number];

/**
 * One attempt to pay a booking online. The amount is fixed by the server when the attempt is
 * created, from what the booking owes; nothing the app sends can change it.
 */
const paymentSchema = new Schema(
  {
    publicId: { type: String, required: true, unique: true },
    bookingId: { type: Schema.Types.ObjectId, ref: 'Booking', required: true },
    bookingPublicId: { type: String, required: true },
    customerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    amountPaise: { type: Number, required: true, min: 1 },
    purpose: { type: String, enum: ['FARE', 'FEE'], required: true },
    status: { type: String, enum: PaymentStatuses, default: 'CREATED' },
    providerOrderId: { type: String, required: true, unique: true },
    providerPaymentId: { type: String },
    // The app's own key for this attempt, so a retried request returns the same order.
    idempotencyKey: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    paidAt: { type: Date },
    failureReason: { type: String, maxlength: 200 },
    // Total of refunds asked for or done. Never allowed to exceed amountPaise.
    refundedPaise: { type: Number, default: 0 },
    // Set once the payment is in the ledger.
    ledgerRecordedAt: { type: Date },
  },
  { timestamps: true },
);
paymentSchema.index({ customerId: 1, idempotencyKey: 1 }, { unique: true });
paymentSchema.index({ bookingId: 1, status: 1 });
paymentSchema.index({ status: 1, expiresAt: 1 });
paymentSchema.index({ status: 1, ledgerRecordedAt: 1, paidAt: 1 });
paymentSchema.index({ createdAt: -1 });

export const Payment = model('Payment', paymentSchema);
