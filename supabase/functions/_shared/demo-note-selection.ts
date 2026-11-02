import type { UnbeatenNote } from './demo-unbeaten-notes.ts';
import { demoCohort } from './demo-226-policy.ts';
import type { DemoCandidate } from './demo-continuation.ts';

// Unbeaten-note support is a bounded bonus combined with the current analysis
// (indicators + learning); it never overrides a much stronger current note.
export const NOTE_SUPPORT_PER_WIN = 0.1;
export const NOTE_SUPPORT_MAX = 0.5;
export function noteSupportBonus(score: number, notes: UnbeatenNote[] = []): number {
  if (!Number.isFinite(score)) return 0;
  const cents = Math.round(Number(score.toFixed(2)) * 100);
  const wins = notes.find(n => n.cents === cents)?.wins ?? 0;
  return Math.min(NOTE_SUPPORT_MAX, wins * NOTE_SUPPORT_PER_WIN);
}
export function selectTakashiByNote<T extends DemoCandidate>(candidates: T[], notes: UnbeatenNote[] = []): T | null {
  const rank = (c: T) => c._score + noteSupportBonus(c._score, notes);
  return candidates.filter(c => demoCohort(c._score, c.entry_strategy) !== null)
    .sort((a, b) => rank(b) - rank(a) || b._score - a._score
      || a.signal_id.localeCompare(b.signal_id))[0] ?? null;
}
