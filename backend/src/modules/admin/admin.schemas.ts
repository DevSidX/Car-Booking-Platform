import { z } from 'zod';
import { AccountStatuses, Roles } from '../../common/enums';
import { paginationSchema } from '../../common/pagination';
import { objectId } from '../../common/zod';
import { BookingStatuses, PaymentStatuses } from '../bookings/booking.model';

export const userListQuerySchema = paginationSchema.extend({
  role: z.enum(Roles).optional(),
  accountStatus: z.enum(AccountStatuses).optional(),
  q: z.string().trim().min(1).max(50).optional(),
});

export const userStatusSchema = z
  .object({
    status: z.enum(['ACTIVE', 'SUSPENDED']),
    reason: z.string().trim().min(3).max(500),
  })
  .strict();

export const bookingListQuerySchema = paginationSchema.extend({
  status: z.enum(BookingStatuses).optional(),
  paymentStatus: z.enum(PaymentStatuses).optional(),
  customerId: objectId.optional(),
  driverId: objectId.optional(),
  /** Booking id (`bk_...`), full or the start of it. */
  q: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_]{2,40}$/)
    .optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export const waiveFeeSchema = z.object({ reason: z.string().trim().min(3).max(300) }).strict();

export const expiringDocumentsQuerySchema = paginationSchema.extend({
  /** Approved documents expiring within this many days, plus everything already expired. */
  days: z.coerce.number().int().min(1).max(365).default(30),
});

export type WaiveFeeInput = z.infer<typeof waiveFeeSchema>;
export type ExpiringDocumentsQuery = z.infer<typeof expiringDocumentsQuerySchema>;
export type UserListQuery = z.infer<typeof userListQuerySchema>;
export type UserStatusInput = z.infer<typeof userStatusSchema>;
export type BookingListQuery = z.infer<typeof bookingListQuerySchema>;
