import type { UnbeatenNote } from './demo-unbeaten-notes.ts';
import { demoCohort } from './demo-226-policy.ts';
import type { DemoCandidate } from './demo-continuation.ts';
// Rank only the current calculated analysis; historical winning-note lists are not inputs.
export function selectTakashiByNote<T extends DemoCandidate>(candidates: T[]): T | null {
  return candidates.filter(c => demoCohort(c._score, c.entry_strategy) === 'takashi')
    .sort((a, b) => b._score - a._score
      || a.signal_id.localeCompare(b.signal_id))[0] ?? null;
}
type Candidate = { signal_id: string; _score: number; _preferredPatternDistance?: number };
export function selectChartWithNoteSupport<T extends Candidate>(candidates: T[], notes: UnbeatenNote[]): T | null {
  const wins = new Map(notes.map(n => [n.cents, n.wins]));
  const support = (c: T) => wins.get(Math.round(Number(c._score.toFixed(2)) * 100)) ?? 0;
  return candidates.filter(c => Number.isFinite(c._score) && Number.isFinite(c._preferredPatternDistance)
    && Number(c._preferredPatternDistance) >= 0 && Number(c._preferredPatternDistance) <= 1.3)
    .sort((a, b) => support(b) - support(a) || Number(a._preferredPatternDistance) - Number(b._preferredPatternDistance)
      || a.signal_id.localeCompare(b.signal_id))[0] ?? null;
}