import { freshSelectedTrend } from './selected-demo-trend.ts';
import { DEMO_ENTRY_STRATEGIES } from './demo-226-policy.ts';

// Only principal strategy (user, Nov 2 2026): after 4 consecutive confirmed LOSS in
// Últimas operações · Demo, the next Demo signal (any Demo strategy) opens the SAME direction
// on the principal IQ account, using the Auto Trading stake. One entry per streak: if it also
// loses, wait for a fresh streak of 4 losses (the Demo gale cycle resets after level 4).
export const FOUR_LOSS_FOLLOW = 'APOS_4_LOSS';
export const FOUR_LOSS_FOLLOW_LABEL = 'Após 5 LOSS';
export const FOUR_LOSS_FOLLOW_PREFIX = 'apos-4-loss-v1-';
export const FOUR_LOSS_STREAK = 5; // user, Nov 3 2026: 5 consecutive LOSS (full gale cycle, levels 4..0); internal key kept

export interface FollowCandidate { entry_minute: string; entry_strategy: string; direction: string; asset: string }
export interface StreakOrder { status: string; result: string; recovery_level: number }

/** Newest-first confirmed Demo orders before the candidate minute: exactly 5 LOSS closing one full gale cycle (levels 4..0). */
export function fourLossStreak(newestFirst: StreakOrder[]): boolean {
  const last = newestFirst.slice(0, FOUR_LOSS_STREAK);
  return last.length === FOUR_LOSS_STREAK
    && last.every(o => o.status === 'confirmed' && o.result === 'loss')
    && Number(last[0].recovery_level) === FOUR_LOSS_STREAK - 1;
}

export function fourLossFollowDirection(current: FollowCandidate | null, newestFirst: StreakOrder[], now: number): 'call' | 'put' | null {
  if (!current || !(DEMO_ENTRY_STRATEGIES as readonly string[]).includes(current.entry_strategy)
    || !['CALL', 'PUT'].includes(current.direction)
    || !freshSelectedTrend(Date.parse(current.entry_minute), now)
    || !fourLossStreak(newestFirst)) return null;
  return current.direction === 'PUT' ? 'put' : 'call';
}

export function isFourLossFollowSignal(signalId: string): boolean {
  return signalId.startsWith(FOUR_LOSS_FOLLOW_PREFIX);
}
