/** PLACEHOLDER money policies until the lead decides. Tests override them through createApp. */
export type FinanceConfig = {
  /** Used when no commission rate is configured for the zone. 2000 = 20.00%. */
  defaultCommissionBp: number;
  /** A rider with an unpaid ride older than this cannot book again. */
  unpaidGraceMs: number;
  /** A driver holding more cash (net of what we owe them) than this cannot go online. */
  driverCashLimitPaise: number;
  /** An online payment that was started but never finished is closed after this long. */
  paymentOrderTtlMs: number;
  /** Accrual / payment follow-up work waits this long before the repair job touches it. */
  reconcileGraceMs: number;
};

export const defaultFinanceConfig: FinanceConfig = {
  defaultCommissionBp: 2000,
  unpaidGraceMs: 24 * 3_600_000,
  driverCashLimitPaise: 200_000,
  paymentOrderTtlMs: 30 * 60_000,
  reconcileGraceMs: 30_000,
};
