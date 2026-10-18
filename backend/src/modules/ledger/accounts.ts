/**
 * Ledger accounts. Entries use debit = positive, credit = negative, and every transaction sums to
 * zero. A balance is simply the sum of the entries on that account.
 *
 *   GATEWAY                 money Razorpay holds for us after a successful online payment
 *   PLATFORM_BANK           our own bank: driver cash deposits in (+), payouts to drivers out (-)
 *   COMMISSION              our earnings from rides and fees (credit, so negative)
 *   RIDER_RECEIVABLE:<id>   what a rider owes us (positive); negative = we hold their credit
 *   DRIVER_PAYABLE:<id>     what we owe a driver (credit, so negative)
 *   DRIVER_CASH:<id>        cash a driver has collected from riders and not yet handed over
 *   REFUNDS / WRITE_OFFS / WAIVED_FEES / PROMOTIONS   money the platform gave up (promotions = coupon discounts)
 */
export const Accounts = {
  gateway: 'GATEWAY',
  bank: 'PLATFORM_BANK',
  commission: 'COMMISSION',
  refunds: 'REFUNDS',
  writeOffs: 'WRITE_OFFS',
  waivedFees: 'WAIVED_FEES',
  promotions: 'PROMOTIONS',
  riderReceivable: (customerId: string) => `RIDER_RECEIVABLE:${customerId}`,
  driverPayable: (driverId: string) => `DRIVER_PAYABLE:${driverId}`,
  driverCash: (driverId: string) => `DRIVER_CASH:${driverId}`,
} as const;
