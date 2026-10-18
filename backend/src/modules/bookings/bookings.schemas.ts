import { z } from 'zod';
import { objectId } from '../../common/zod';

const lat = z.number().min(-90).max(90);
const lng = z.number().min(-180).max(180);

export const idempotencyKeySchema = z
  .string({ error: 'Idempotency-Key header is required' })
  .min(8)
  .max(128)
  .regex(/^[A-Za-z0-9_.:-]+$/, 'Idempotency-Key may contain letters, digits and _ . : -');

/**
 * Pickup/drop/category may be echoed by the app for convenience, but they are never trusted:
 * they must match the quote or the request is rejected. The quote is the source of truth.
 */
export const createBookingSchema = z
  .object({
    quoteId: z.string().min(1).max(40),
    paymentMethod: z.enum(['CASH', 'ONLINE']),
    rideType: z.literal('INSTANT').default('INSTANT'),
    notes: z.string().trim().max(300).optional(),
    pickup: z
      .object({
        lat,
        lng,
        label: z.string().max(200).optional(),
        contactName: z.string().trim().min(1).max(100).optional(),
        contactPhone: z.string().min(5).max(20).optional(),
      })
      .strict()
      .optional(),
    drop: z
      .object({ lat, lng, label: z.string().max(200).optional() })
      .strict()
      .optional(),
    categoryId: objectId.optional(),
    // Echoed for convenience; must match the stops on the quote.
    stops: z
      .array(z.object({ lat, lng, label: z.string().max(200).optional() }).strict())
      .max(3)
      .optional(),
  })
  .strict();

export type CreateBookingInput = z.infer<typeof createBookingSchema>;
