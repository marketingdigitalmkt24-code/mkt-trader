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
// Oct 26 2026: Demo-only "Força antecipada" joins the rotation (never principal/Telegram/copy).
export const FORCA_ANTECIPADA_STRATEGY = 'FORCA_ANTECIPADA_V1';
export type DemoCohort = 'takashi' | 'score226' | 'antecipada';
export function demoCohort(score: number, strategy: unknown): DemoCohort | null {
  if (strategy === TAKASHI_STRATEGY) return 'takashi';
  if (strategy === FORCA_ANTECIPADA_STRATEGY) return 'antecipada';
  return demo226Authorized(score, strategy) ? 'score226' : null;
}
export function demoAlternationAuthorized(score: number, strategy: unknown): boolean {
  return demoCohort(score, strategy) !== null;
}
// Rotate Takashi -> 2,26 -> Força antecipada; fall back so a minute is never wasted.
export function preferredDemoCohort(previousStrategy: unknown): DemoCohort {
  if (previousStrategy === TAKASHI_STRATEGY) return 'score226';
  if (previousStrategy === FORCA_ANTECIPADA_STRATEGY) return 'takashi';
  return 'antecipada';
}
