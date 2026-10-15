// Fixed demonstration exchange rates (to EUR). A production deployment reads
// these from the insurer's treasury feed; the demo keeps them constant so
// guarantee decisions are reproducible.
export const DEMO_FX_TO_EUR: Record<string, number> = {
  EUR: 1,
  TRY: 1 / 38,
  USD: 0.92,
  GBP: 1.17,
  CHF: 1.06,
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
