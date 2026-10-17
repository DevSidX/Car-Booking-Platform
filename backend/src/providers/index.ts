import type { Env } from '../config/env';
import { createMockProviders } from './mock';
import type { Providers } from './types';

export * from './types';

export function createProviders(env: Pick<Env, 'NODE_ENV' | 'PROVIDER_MODE'>): Providers {
  if (env.PROVIDER_MODE === 'mock') {
    if (env.NODE_ENV === 'production') {
      throw new Error('Mock providers are not allowed in production');
    }
    return createMockProviders();
  }
  // Real adapters (Google Maps, Razorpay, FCM, SMS, R2) are added in the phase that needs them.
  throw new Error('Live providers are not implemented yet');
}
