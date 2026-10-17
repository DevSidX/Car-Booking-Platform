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
}

export interface PushProvider {
  send(
    deviceToken: string,
    payload: { title: string; body: string; data?: Record<string, string> },
  ): Promise<{ providerMessageId: string }>;
}

export interface PaymentsProvider {
  /** Creates a provider order server-side. Amount is integer paise. */
  createOrder(input: { amountPaise: number; receipt: string }): Promise<{ orderId: string }>;
  verifyPaymentSignature(input: { orderId: string; paymentId: string; signature: string }): boolean;
  verifyWebhookSignature(rawBody: Buffer, signature: string): boolean;
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
