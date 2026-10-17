export type FieldError = { field: string; message: string };

/** Frozen error-code catalogue (see docs/api-contract.md). Add codes; never rename. */
export const ErrorCodes = {
  VALIDATION_ERROR: { status: 400, message: 'Request validation failed.' },
  UNAUTHENTICATED: { status: 401, message: 'Authentication required.' },
  FORBIDDEN: { status: 403, message: 'You are not allowed to perform this action.' },
  NOT_FOUND: { status: 404, message: 'Resource not found.' },
  CONFLICT: { status: 409, message: 'Request conflicts with current state.' },
  RIDE_ALREADY_ASSIGNED: {
    status: 409,
    message: 'This ride has already been accepted by another driver.',
  },
  RIDE_INVALID_STATE: {
    status: 409,
    message: 'Ride cannot perform this action in its current state.',
  },
  UNPROCESSABLE: { status: 422, message: 'Business validation failed.' },
  RATE_LIMITED: { status: 429, message: 'Too many requests. Please try again later.' },
  INTERNAL_ERROR: { status: 500, message: 'Something went wrong.' },
  PROVIDER_ERROR: { status: 502, message: 'An upstream provider failed.' },
  SERVICE_UNAVAILABLE: { status: 503, message: 'Service temporarily unavailable.' },
} as const;

export type ErrorCode = keyof typeof ErrorCodes;

export class AppError extends Error {
  readonly status: number;
  constructor(
    public readonly code: ErrorCode,
    message?: string,
    public readonly fieldErrors: FieldError[] = [],
  ) {
    super(message ?? ErrorCodes[code].message);
    this.name = 'AppError';
    this.status = ErrorCodes[code].status;
  }
}
