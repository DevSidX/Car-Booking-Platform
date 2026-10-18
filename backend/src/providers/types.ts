/** Provider adapter contracts. Business modules depend on these, never on vendor SDKs. */

export type LatLng = { lat: number; lng: number };

export interface MapsProvider {
  /** Road distance/duration between two points. */
  route(
    origin: LatLng,
    destination: LatLng,
  ): Promise<{ distanceMeters: number; durationSeconds: number }>;
  geocode(address: string): Promise<LatLng | null>;
  reverseGeocode(point: LatLng): Promise<string | null>;
}

export interface SmsProvider {
  sendOtp(phoneE164: string, otp: string): Promise<{ providerMessageId: string }>;
  /** A plain text message (e.g. an emergency alert to a saved contact). Needs an approved template in India. */
  sendText(phoneE164: string, message: string): Promise<{ providerMessageId: string }>;
}

export type PushPayload = {
  title: string;
  body: string;
  /** All values must be strings (a push-service rule). Never put phone numbers or OTPs here. */
  data?: Record<string, string>;
  /** high wakes a sleeping phone (ride offers); normal can be batched by the OS. */
  priority?: 'high' | 'normal';
  /** Drop the message instead of delivering it late. */
  ttlSeconds?: number;
};

/** Thrown by a push adapter when the device token is permanently dead; the caller deletes it. */
export class InvalidPushTokenError extends Error {
  constructor() {
    super('Push token is no longer valid.');
    this.name = 'InvalidPushTokenError';
  }
}

export interface PushProvider {
  /** Resolves on success; throws InvalidPushTokenError for a dead token, any other Error if retryable. */
  send(deviceToken: string, payload: PushPayload): Promise<{ providerMessageId: string }>;
}

export interface PaymentsProvider {
  /** Public key the app's checkout screen needs (safe to show; not the secret). */
  readonly checkoutKey: string;
  /** Creates a provider order server-side. Amount is integer paise. */
  createOrder(input: {
    amountPaise: number;
    receipt: string;
    notes?: Record<string, string>;
  }): Promise<{ orderId: string }>;
  verifyPaymentSignature(input: { orderId: string; paymentId: string; signature: string }): boolean;
  verifyWebhookSignature(rawBody: Buffer, signature: string): boolean;
  /** Refund (part of) a captured payment. `pending` finishes later via the refund webhook. */
  createRefund(input: {
    paymentId: string;
    amountPaise: number;
    receipt: string;
  }): Promise<{ refundId: string; status: 'pending' | 'processed' | 'failed' }>;
}

export interface StorageProvider {
  createUploadUrl(
    objectKey: string,
    contentType: string,
  ): Promise<{ url: string; expiresInSeconds: number }>;
  createDownloadUrl(objectKey: string): Promise<{ url: string; expiresInSeconds: number }>;
}

export interface Providers {
  maps: MapsProvider;
  sms: SmsProvider;
  push: PushProvider;
  payments: PaymentsProvider;
  storage: StorageProvider;
}
