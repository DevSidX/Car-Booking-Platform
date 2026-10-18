import type { RequestHandler } from 'express';
import { actorFrom } from '../../common/actor';
import { AppError } from '../../common/errors';
import { ok } from '../../common/response';
import { createBookingSchema, idempotencyKeySchema } from './bookings.schemas';
import type { BookingsService } from './bookings.service';

export function createBookingsController(service: BookingsService) {
  const create: RequestHandler = async (req, res) => {
    const keyResult = idempotencyKeySchema.safeParse(req.header('idempotency-key'));
    if (!keyResult.success) {
      throw new AppError('VALIDATION_ERROR', undefined, [
        { field: 'Idempotency-Key', message: keyResult.error.issues[0]?.message ?? 'Invalid' },
      ]);
    }
    const input = createBookingSchema.parse(req.body);
    const { booking, replayed } = await service.create(
      actorFrom(req).userId,
      keyResult.data,
      input,
    );
    if (replayed) res.setHeader('Idempotent-Replayed', 'true');
    ok(res, booking, replayed ? 200 : 201);
  };

  const get: RequestHandler = async (req, res) => {
    ok(res, await service.get(actorFrom(req), String(req.params['bookingId'])));
  };

  const events: RequestHandler = async (req, res) => {
    ok(res, await service.events(actorFrom(req), String(req.params['bookingId'])));
  };

  return { create, get, events };
}
