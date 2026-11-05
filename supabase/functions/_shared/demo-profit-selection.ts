import { demoCohort } from './demo-226-policy.ts';
import type { DemoCandidate } from './demo-continuation.ts';

// Nov 3 2026 00:48 BRT (user): no expected-profit / note ranking between strategies.
// Ichimoku + Recuo 21 keeps priority whenever it has a candidate; otherwise the strategies take
// turns in a fixed cycle, starting after the strategy that took the previous minute's slot.
// Nov 5 2026: inside the chosen strategy, stable signal ID breaks ties; notes are ignored.
export type StrategyOutcome = { entry_strategy: string; result: string };
export type ProfitCandidate = DemoCandidate & { _payout?: number | null };

export const DEMO_PRIORITY_STRATEGY = 'ICHIMOKU_RECUO21';
export const DEMO_ROTATION = ['TENDENCIA_FORCA_RECUO', 'ICHIMOKU', 'RECUO_EMA21'] as const;

export function nextRotationOrder(previousStrategy: unknown): string[] {
  const at = (DEMO_ROTATION as readonly unknown[]).indexOf(previousStrategy);
  return DEMO_ROTATION.map((_, i) => DEMO_ROTATION[(at + 1 + i) % DEMO_ROTATION.length]);
}

export function selectDemoByRotation<T extends ProfitCandidate>(candidates: T[], previousStrategy: unknown): T | null {
  const eligible = candidates.filter(c => demoCohort(c._score, c.entry_strategy) !== null);
  const best = (list: T[]) => [...list].sort((a, b) =>
    a.signal_id.localeCompare(b.signal_id))[0] ?? null;
  const priority = eligible.filter(c => c.entry_strategy === DEMO_PRIORITY_STRATEGY);
  if (priority.length) return best(priority);
  for (const strategy of nextRotationOrder(previousStrategy)) {
    const pick = best(eligible.filter(c => c.entry_strategy === strategy));
    if (pick) return pick;
  }
  return null;
}
