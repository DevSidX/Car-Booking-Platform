import type { Env } from '../config/env';
import { createFcmPush, parseServiceAccount } from './fcm';
import { createNimbusSms, DEFAULT_OTP_MESSAGE } from './nimbus';
import { createMockProviders, type MockOptions } from './mock';
import { createRazorpayPayments } from './razorpay';
import type { Providers } from './types';

export * from './types';

export function createProviders(
  env: Pick<Env, 'NODE_ENV' | 'PROVIDER_MODE'> &
    Partial<
      Pick<
        Env,
        | 'PUSH_DRIVER'
        | 'SMS_DRIVER'
        | 'SMS_API_URL'
        | 'SMS_USER_ID'
        | 'SMS_PASSWORD'
        | 'SMS_SENDER_ID'
        | 'SMS_ENTITY_ID'
        | 'SMS_TEMPLATE_ID'
        | 'SMS_OTP_MESSAGE'
        | 'SMS_ALERT_TEMPLATE_ID'
        | 'FCM_SERVICE_ACCOUNT_JSON'
        | 'PAYMENTS_DRIVER'
        | 'RAZORPAY_KEY_ID'
        | 'RAZORPAY_KEY_SECRET'
        | 'RAZORPAY_WEBHOOK_SECRET'
      >
    >,
  mockOptions: MockOptions = {},
): Providers {
  if (env.PROVIDER_MODE === 'mock') {
    if (env.NODE_ENV === 'production') {
      throw new Error('Mock providers are not allowed in production');
    }
    let mocks = createMockProviders(mockOptions);
    // Real payments can be switched on alone (Razorpay TEST keys on staging) while the rest stay mocks.
    if (env.PAYMENTS_DRIVER === 'razorpay') {
      mocks = {
        ...mocks,
        payments: createRazorpayPayments({
          keyId: env.RAZORPAY_KEY_ID ?? '',
          keySecret: env.RAZORPAY_KEY_SECRET ?? '',
          webhookSecret: env.RAZORPAY_WEBHOOK_SECRET ?? '',
        }),
      };
    }
    // Real SMS can be switched on alone too (OTP and emergency texts).
    if (env.SMS_DRIVER === 'nimbus') {
      mocks = {
        ...mocks,
        sms: createNimbusSms({
          apiUrl: env.SMS_API_URL ?? '',
          userId: env.SMS_USER_ID ?? '',
          password: env.SMS_PASSWORD ?? '',
          senderId: env.SMS_SENDER_ID ?? '',
          entityId: env.SMS_ENTITY_ID ?? '',
          otp: {
            templateId: env.SMS_TEMPLATE_ID ?? '',
            message: env.SMS_OTP_MESSAGE ?? DEFAULT_OTP_MESSAGE,
          },
          alert: env.SMS_ALERT_TEMPLATE_ID ? { templateId: env.SMS_ALERT_TEMPLATE_ID } : undefined,
        }),
      };
    }
    // Real push can be switched on alone (staging) while everything else is still a mock.
    if (env.PUSH_DRIVER === 'fcm') {
      const serviceAccount = parseServiceAccount(env.FCM_SERVICE_ACCOUNT_JSON ?? '');
      return { ...mocks, push: createFcmPush({ serviceAccount }) };
    }
    return mocks;
  }
  // Real adapters (Google Maps, Razorpay, FCM, SMS, R2) are added in the phase that needs them.
  throw new Error('Live providers are not implemented yet');
}
