import { demoDisplayedTargetScore } from './demo-continuation.ts';

// Oct 25 2026 17:51 UTC: Takashi no longer uses the 2.26 authorization (stays out of real/Telegram/copy).
export function demo226StrategyAllowed(strategy: unknown): boolean {
  return strategy === 'VELA_FORCA' || strategy === 'TENDENCIA';
}

export function demo226Authorized(score: number, strategy: unknown): boolean {
  return demoDisplayedTargetScore(score) && demo226StrategyAllowed(strategy);
}

// Oct 25 2026 19:02 UTC: Demo alternates Takashi entries with displayed-2.26 entries.
export const TAKASHI_STRATEGY = 'TAKASHI_BNF_V1';
export type DemoCohort = 'takashi' | 'score226';
export function demoCohort(score: number, strategy: unknown): DemoCohort | null {
  if (strategy === TAKASHI_STRATEGY) return 'takashi';
  return demo226Authorized(score, strategy) ? 'score226' : null;
}
export function demoAlternationAuthorized(score: number, strategy: unknown): boolean {
  return demoCohort(score, strategy) !== null;
}
// Prefer the cohort that did not take the previous Demo slot; fall back so a minute is never wasted.
export function preferredDemoCohort(previousStrategy: unknown): DemoCohort {
  return previousStrategy === TAKASHI_STRATEGY ? 'score226' : 'takashi';
}
