import { z } from 'zod';
import { parseServiceAccount } from '../providers/fcm';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  CORS_ORIGINS: z
    .string()
    .default('')
    .transform((v) =>
      v
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  MONGODB_URI: z.string().min(1),
  MONGO_MAX_POOL_SIZE: z.coerce.number().int().min(5).max(200).default(20),
  // Nothing uses Redis yet (dispatch runs on a DB sweeper). Optional outside production until P4.
  REDIS_URL: z.string().optional(),
  JWT_ACCESS_SECRET: z.string().min(32, 'must be at least 32 characters'),
  JWT_REFRESH_SECRET: z.string().min(32, 'must be at least 32 characters'),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).default(30),
  OTP_TTL_SECONDS: z.coerce.number().int().min(30).default(300),
  OTP_RESEND_SECONDS: z.coerce.number().int().min(0).default(30),
  OTP_MAX_ATTEMPTS: z.coerce.number().int().min(1).default(5),
  OTP_MAX_PER_HOUR: z.coerce.number().int().min(1).default(5),
  PROVIDER_MODE: z.enum(['mock', 'live']).default('mock'),
  // mock = log only; fcm = real Firebase push (needs FCM_SERVICE_ACCOUNT_JSON).
  PUSH_DRIVER: z.enum(['mock', 'fcm']).default('mock'),
  FCM_SERVICE_ACCOUNT_JSON: z.string().optional(),
  // Lets a metrics tool read GET /api/v1/metrics (Prometheus text) with `Authorization: Bearer <token>`. Empty = endpoint off.
  METRICS_TOKEN: z.string().min(16).optional(),
  // Where alerts go (a Slack/Discord-style incoming webhook that accepts { text }). Empty = log only.
  ALERT_WEBHOOK_URL: z.string().url().optional(),
  // mock = OTPs are only logged; nimbus = real SMS through the DLT gateway (needs the SMS_* values).
  SMS_DRIVER: z.enum(['mock', 'nimbus']).default('mock'),
  SMS_API_URL: z.string().url().optional(),
  SMS_USER_ID: z.string().optional(),
  SMS_PASSWORD: z.string().optional(),
  SMS_SENDER_ID: z.string().optional(),
  SMS_ENTITY_ID: z.string().optional(),
  SMS_TEMPLATE_ID: z.string().optional(),
  // The login-OTP wording registered with DLT; {otp} is replaced by the code.
  SMS_OTP_MESSAGE: z.string().optional(),
  // DLT template for emergency texts to saved contacts. Without it those texts are not sent.
  SMS_ALERT_TEMPLATE_ID: z.string().optional(),
  // Web address the emergency text links to (the page that shows a shared trip), no trailing slash.
  TRIP_LINK_BASE: z.string().url().optional(),
  // mock = no real money moves; razorpay = real Razorpay (use TEST keys outside production).
  PAYMENTS_DRIVER: z.enum(['mock', 'razorpay']).default('mock'),
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),
  // Staging/QA only: every login OTP is this code, so testers need no SMS. Refused in production.
  STAGING_FIXED_OTP: z
    .string()
    .regex(/^\d{6}$/, 'must be exactly 6 digits')
    .optional(),
});

export type Env = z.infer<typeof schema>;

export class EnvValidationError extends Error {
  constructor(public readonly issues: string[]) {
    super(`Invalid environment configuration:\n - ${issues.join('\n - ')}`);
    this.name = 'EnvValidationError';
  }
}

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    throw new EnvValidationError(
      parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`),
    );
  }
  const env = parsed.data;
  if (env.NODE_ENV === 'production' && env.PROVIDER_MODE === 'mock') {
    throw new EnvValidationError(['PROVIDER_MODE: mock providers are not allowed in production']);
  }
  if (env.PUSH_DRIVER === 'fcm') {
    try {
      parseServiceAccount(env.FCM_SERVICE_ACCOUNT_JSON ?? '');
    } catch (err) {
      throw new EnvValidationError([
        `PUSH_DRIVER=fcm: ${err instanceof Error ? err.message : 'invalid FCM_SERVICE_ACCOUNT_JSON'}`,
      ]);
    }
  }
  if (env.NODE_ENV === 'production' || env.NODE_ENV === 'staging') {
    if (env.CORS_ORIGINS.includes('*')) {
      throw new EnvValidationError(['CORS_ORIGINS: a wildcard is not allowed outside development']);
    }
  }
  if (env.JWT_ACCESS_SECRET === env.JWT_REFRESH_SECRET) {
    throw new EnvValidationError([
      'JWT_REFRESH_SECRET: must differ from JWT_ACCESS_SECRET (one leaked secret must not open both)',
    ]);
  }
  if (env.SMS_DRIVER === 'nimbus') {
    const missing = (
      [
        'SMS_API_URL',
        'SMS_USER_ID',
        'SMS_PASSWORD',
        'SMS_SENDER_ID',
        'SMS_ENTITY_ID',
        'SMS_TEMPLATE_ID',
      ] as const
    ).filter((k) => !env[k]);
    if (missing.length > 0) {
      throw new EnvValidationError([`SMS_DRIVER=nimbus needs ${missing.join(', ')}`]);
    }
  }
  if (
    env.PAYMENTS_DRIVER === 'razorpay' &&
    !(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET && env.RAZORPAY_WEBHOOK_SECRET)
  ) {
    throw new EnvValidationError([
      'PAYMENTS_DRIVER=razorpay needs RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET and RAZORPAY_WEBHOOK_SECRET',
    ]);
  }
  if (env.NODE_ENV === 'production' && env.STAGING_FIXED_OTP) {
    throw new EnvValidationError(['STAGING_FIXED_OTP: not allowed in production']);
  }
  if (env.NODE_ENV === 'production' && !env.REDIS_URL) {
    throw new EnvValidationError(['REDIS_URL: required in production']);
  }
  return env;
}
