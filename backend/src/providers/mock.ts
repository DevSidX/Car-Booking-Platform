import { randomUUID } from 'node:crypto';
import { InvalidPushTokenError, type LatLng, type Providers, type PushPayload } from './types';

/**
 * Deterministic in-process fakes for local development and tests ONLY.
 * createProviders() refuses to hand these out in production. Payment verification
 * in the mock never returns true for unknown input, so a mock can't fake "paid".
 */
function haversineMeters(a: LatLng, b: LatLng): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export type MockOptions = {
  onOtp?: (phone: string, otp: string) => void;
  /** Called for every text message the mock "sends" (emergency alerts). */
  onText?: (phone: string, message: string) => void;
  /** Called for every push the mock "delivers". */
  onPush?: (token: string, payload: PushPayload) => void;
  /** Lets a test make a token fail: 'invalid' = dead token, 'error' = temporary outage. */
  pushFailure?: (token: string) => 'invalid' | 'error' | undefined;
};

export function createMockProviders(options: MockOptions = {}): Providers {
  const orders = new Set<string>();
  return {
    maps: {
      async route(origin, destination) {
        // Straight-line x1.3 road factor, 30 km/h average. Dev-only approximation.
        const distanceMeters = Math.round(haversineMeters(origin, destination) * 1.3);
        return { distanceMeters, durationSeconds: Math.round(distanceMeters / (30_000 / 3600)) };
      },
      async geocode() {
        return null;
      },
      async reverseGeocode(point) {
        return `Mock address (${point.lat.toFixed(4)}, ${point.lng.toFixed(4)})`;
      },
    },
    sms: {
      async sendOtp(phone, otp) {
        options.onOtp?.(phone, otp);
        return { providerMessageId: `mock_sms_${randomUUID()}` };
      },
      async sendText(phone, message) {
        options.onText?.(phone, message);
        return { providerMessageId: `mock_sms_${randomUUID()}` };
      },
    },
    push: {
      async send(token, payload) {
        const failure = options.pushFailure?.(token);
        if (failure === 'invalid') throw new InvalidPushTokenError();
        if (failure === 'error') throw new Error('mock push outage');
        options.onPush?.(token, payload);
        return { providerMessageId: `mock_push_${randomUUID()}` };
      },
    },
    payments: {
      checkoutKey: 'mock_checkout_key',
      async createOrder() {
        const orderId = `mock_order_${randomUUID()}`;
        orders.add(orderId);
        return { orderId };
      },
      verifyPaymentSignature: () => false,
      verifyWebhookSignature: () => false,
      async createRefund() {
        return { refundId: `mock_refund_${randomUUID()}`, status: 'pending' as const };
      },
    },
    storage: {
      async createUploadUrl(objectKey) {
        return {
          url: `http://localhost/mock-upload/${encodeURIComponent(objectKey)}`,
          expiresInSeconds: 300,
        };
      },
      async createDownloadUrl(objectKey) {
        return {
          url: `http://localhost/mock-download/${encodeURIComponent(objectKey)}`,
          expiresInSeconds: 300,
        };
      },
    },
  };
}
