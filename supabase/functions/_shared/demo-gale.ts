// Demo-only recovery ("gale") after a confirmed LOSS, sized by the asset's return.
// User (28/10/2026): at most four gales; if all four lose, go back to the base amount.
export const DEMO_MAX_GALE = 4;

export type DemoGalePrevious = {
  result: string;
  amount: number | string;
  recovery_level?: number | null;
  recovery_loss?: number | string | null;
};
export type DemoGaleState = { level: number; loss: number };

const cents = (value: number) => Math.round(value * 100) / 100;

/** Next state from the latest confirmed Demo order; null while its result is unknown. */
export function nextDemoGaleState(last: DemoGalePrevious | null): DemoGaleState | null {
  if (!last) return { level: 0, loss: 0 };
  if (last.result === 'pending') return null;
  const level = Math.min(DEMO_MAX_GALE, Math.max(0, Math.trunc(Number(last.recovery_level) || 0)));
  const loss = Math.max(0, Number(last.recovery_loss) || 0);
  if (last.result === 'win') return { level: 0, loss: 0 };
  if (last.result === 'loss') {
    if (level >= DEMO_MAX_GALE) return { level: 0, loss: 0 };
    return { level: level + 1, loss: cents(loss + Math.max(0, Number(last.amount) || 0)) };
  }
  // Tie refunds the stake: repeat the same step.
  return { level, loss };
}

/** Amount that recovers accumulated losses plus the base entry's expected gain. */
export function demoGaleAmount(base: number, state: DemoGaleState, payout: number | null): number | null {
  if (!(base > 0)) return null;
  if (state.level === 0) return cents(base);
  if (payout === null || !(payout > 0 && payout <= 2)) return null;
  return Math.ceil(((state.loss + base * payout) / payout) * 100 - 1e-6) / 100;
}

/** Net return per unit from broker data; falls back to the latest confirmed Demo WIN. */
export function demoPayout(active: any, lastWin?: { amount: number | string; profit: number | string } | null): number | null {
  const commission = Number(active?.option?.profit?.commission);
  if (Number.isFinite(commission) && commission > 0 && commission < 100) return (100 - commission) / 100;
  const amount = Number(lastWin?.amount), profit = Number(lastWin?.profit);
  if (amount > 0 && profit > 0 && profit / amount <= 2) return profit / amount;
  return null;
}
