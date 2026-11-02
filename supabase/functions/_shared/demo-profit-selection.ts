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

// Nov 2 2026 (user): Ichimoku + Recuo 21 has priority when it has an eligible candidate that minute.
// Otherwise strategies take turns (weighted rotation): every strategy with a candidate keeps entering,
// but the one with the better recent result gets proportionally more turns.
export const DEMO_PRIORITY_STRATEGY = 'ICHIMOKU_RECUO21';
export const ROTATION_WINDOW = 30;      // most recent settled Demo entries used to count turns
export const STRATEGY_RESULT_WINDOW = 20; // most recent settled entries of each strategy used for its weight
export const MIN_ROTATION_WEIGHT = 0.2; // a losing streak never removes a strategy from the rotation

// history must be newest first (as fetched). Weight = smoothed win rate of the strategy's own last entries.
export function recentStrategyWeight(history: StrategyOutcome[], strategy: string): number {
  const own = history.filter(r => r.entry_strategy === strategy && (r.result === 'win' || r.result === 'loss')).slice(0, STRATEGY_RESULT_WINDOW);
  return Math.max(MIN_ROTATION_WEIGHT, strategyWinRate(own, strategy));
}

export function pickRotationStrategy(strategies: string[], history: StrategyOutcome[]): string | null {
  const unique = [...new Set(strategies)];
  if (!unique.length) return null;
  const recent = history.filter(r => r.result === 'win' || r.result === 'loss').slice(0, ROTATION_WINDOW);
  const weights = new Map(unique.map(s => [s, recentStrategyWeight(history, s)]));
  const counts = new Map(unique.map(s => [s, recent.filter(r => r.entry_strategy === s).length]));
  const totalWeight = [...weights.values()].reduce((a, b) => a + b, 0);
  const turns = [...counts.values()].reduce((a, b) => a + b, 0) + 1;
  // Deficit = turns this strategy deserves by its result share minus turns it actually had.
  return unique
    .map(s => ({ s, deficit: (weights.get(s)! / totalWeight) * turns - counts.get(s)!, w: weights.get(s)! }))
    .sort((a, b) => b.deficit - a.deficit || b.w - a.w || a.s.localeCompare(b.s))[0].s;
}

export function selectDemoByExpectedProfit<T extends ProfitCandidate>(candidates: T[], history: StrategyOutcome[]): (T & { _expectedProfit: number }) | null {
  const eligible = candidates.filter(c => demoCohort(c._score, c.entry_strategy) !== null);
  const priority = eligible.filter(c => c.entry_strategy === DEMO_PRIORITY_STRATEGY);
  if (priority.length) return rankByExpectedProfit(priority, history);
  const turn = pickRotationStrategy(eligible.map(c => c.entry_strategy), history);
  return rankByExpectedProfit(eligible.filter(c => c.entry_strategy === turn), history);
}
function rankByExpectedProfit<T extends ProfitCandidate>(candidates: T[], history: StrategyOutcome[]): (T & { _expectedProfit: number }) | null {
  const rates = new Map<string, number>();
  const rate = (s: string) => rates.get(s) ?? (rates.set(s, strategyWinRate(history, s)), rates.get(s)!);
  return candidates
    .map(c => ({ ...c, _expectedProfit: expectedProfitPerUnit(rate(c.entry_strategy), c._payout) }))
    // Within the strategy whose turn it is, the asset with the best expected profit enters.
    .sort((a, b) => b._expectedProfit - a._expectedProfit || a.signal_id.localeCompare(b.signal_id))[0] ?? null;
}
