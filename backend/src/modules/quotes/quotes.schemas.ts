import { z } from 'zod';
import { objectId } from '../../common/zod';

const lat = z.number().min(-90).max(90);
const lng = z.number().min(-180).max(180);

/** Hard ceiling on stops. (The per-deployment limit lives in the dispatch config.) */
export const MAX_STOPS = 3;

export const quotePointSchema = z
  .object({ lat, lng, label: z.string().trim().max(200).optional() })
  .strict();

export const createQuoteSchema = z
  .object({
    pickup: quotePointSchema,
    drop: quotePointSchema,
    // Up to 3 intermediate stops, visited in this order.
    stops: z.array(quotePointSchema).max(MAX_STOPS).optional(),
    categoryId: objectId,
    paymentPreference: z.enum(['CASH', 'ONLINE']).optional(),
    couponCode: z.string().trim().min(3).max(30).nullable().optional(),
  })
  .strict();

export const serviceabilityQuerySchema = z.object({
  pickupLat: z.coerce.number().min(-90).max(90),
  pickupLng: z.coerce.number().min(-180).max(180),
  dropLat: z.coerce.number().min(-90).max(90),
  dropLng: z.coerce.number().min(-180).max(180),
});

export type CreateQuoteInput = z.infer<typeof createQuoteSchema>;
export type ServiceabilityQuery = z.infer<typeof serviceabilityQuerySchema>;
