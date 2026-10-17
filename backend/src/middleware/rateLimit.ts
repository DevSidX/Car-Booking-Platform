import rateLimit from 'express-rate-limit';
import { AppError } from '../common/errors';

/** Baseline global limiter. Stricter per-route limiters (OTP, booking) are added in later phases. */
export function globalRateLimiter(max = 300, windowMs = 60_000) {
  return rateLimit({
    windowMs,
    limit: max,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, _res, next) => next(new AppError('RATE_LIMITED')),
  });
}
