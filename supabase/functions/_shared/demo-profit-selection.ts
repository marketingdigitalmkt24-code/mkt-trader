import { demoCohort } from './demo-226-policy.ts';
import type { DemoCandidate } from './demo-continuation.ts';

// Nov 2 2026 (user): the single Demo slot goes to the candidate that can give the most profit,
// not the highest note (Ichimoku + Recuo 21 has priority, see below).
// Expected profit per US$1 = p * payout - (1 - p), where p is the strategy's own confirmed
// Demo win rate (WIN/LOSS only, ties excluded) smoothed with one virtual WIN and one virtual LOSS,
// and payout is the broker's current payout for that candidate's asset.
export type StrategyOutcome = { entry_strategy: string; result: string };
export type ProfitCandidate = DemoCandidate & { _payout?: number | null };

export function strategyWinRate(history: StrategyOutcome[], strategy: string): number {
  let wins = 0, losses = 0;
  for (const row of history) {
    if (row.entry_strategy !== strategy) continue;
    if (row.result === 'win') wins++;
    else if (row.result === 'loss') losses++;
  }
  return (wins + 1) / (wins + losses + 2);
}

export function expectedProfitPerUnit(winRate: number, payout: number | null | undefined): number {
  // Unknown payout cannot be shown to be profitable: it only wins the slot when nothing else exists.
  if (typeof payout !== 'number' || !Number.isFinite(payout) || payout <= 0) return -1;
  return winRate * payout - (1 - winRate);
}

// Nov 2 2026 (user): Ichimoku + Recuo 21 has priority when it has an eligible candidate that minute;
// otherwise every strategy still competes by expected profit.
export const DEMO_PRIORITY_STRATEGY = 'ICHIMOKU_RECUO21';
export function selectDemoByExpectedProfit<T extends ProfitCandidate>(candidates: T[], history: StrategyOutcome[]): (T & { _expectedProfit: number }) | null {
  const eligible = candidates.filter(c => demoCohort(c._score, c.entry_strategy) !== null);
  const priority = eligible.filter(c => c.entry_strategy === DEMO_PRIORITY_STRATEGY);
  return rankByExpectedProfit(priority.length ? priority : eligible, history);
}
function rankByExpectedProfit<T extends ProfitCandidate>(candidates: T[], history: StrategyOutcome[]): (T & { _expectedProfit: number }) | null {
  const rates = new Map<string, number>();
  const rate = (s: string) => rates.get(s) ?? (rates.set(s, strategyWinRate(history, s)), rates.get(s)!);
  return candidates
    .map(c => ({ ...c, _expectedProfit: expectedProfitPerUnit(rate(c.entry_strategy), c._payout) }))
    // Neutral tie-break (no strategy preference): stable signal id order.
    .sort((a, b) => b._expectedProfit - a._expectedProfit || a.signal_id.localeCompare(b.signal_id))[0] ?? null;
}
