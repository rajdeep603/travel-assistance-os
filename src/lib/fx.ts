// Fixed demonstration exchange rates (to EUR). A production deployment reads
// these from the insurer's treasury feed; the demo keeps them constant so
// guarantee decisions are reproducible.
export const DEMO_FX_TO_EUR: Record<string, number> = {
  EUR: 1,
  TRY: 1 / 38,
  USD: 0.92,
  GBP: 1.17,
  CHF: 1.06,
  // Asia-Pacific, for assistance companies run out of Singapore.
  SGD: 1 / 1.47,
  MYR: 1 / 4.8,
  THB: 1 / 37,
  JPY: 1 / 163,
  HKD: 1 / 8.5,
  CNY: 1 / 7.8,
  PHP: 1 / 62,
  IDR: 1 / 17_400,
  // Middle East and Africa.
  AED: 1 / 4.1,
  SAR: 1 / 4.2,
  EGP: 1 / 55,
  TND: 1 / 3.35,
  ZAR: 1 / 20,
  // The Americas.
  CAD: 1 / 1.55,
  MXN: 1 / 21,
  DOP: 1 / 68,
  BRL: 1 / 6.2,
  // South-East Europe and the Western Balkans.
  RON: 1 / 4.97,
  ALL: 1 / 98,
  MKD: 1 / 61.5,
  RSD: 1 / 117,
  BAM: 1 / 1.956,
};

export function toEur(amount: number, currency: string): number | null {
  const rate = DEMO_FX_TO_EUR[currency.toUpperCase()];
  return rate == null ? null : amount * rate;
}

export function fromEur(amountEur: number, currency: string): number | null {
  const rate = DEMO_FX_TO_EUR[currency.toUpperCase()];
  return rate == null ? null : amountEur / rate;
}

export const round2 = (n: number) => Math.round(n * 100) / 100;
