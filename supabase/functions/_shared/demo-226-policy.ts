import { demoDisplayedTargetScore } from './demo-continuation.ts';

// Oct 25 2026 17:51 UTC: Takashi no longer uses the 2.26 authorization (stays observation-only).
export function demo226StrategyAllowed(strategy: unknown): boolean {
  return strategy === 'VELA_FORCA' || strategy === 'TENDENCIA';
}

export function demo226Authorized(score: number, strategy: unknown): boolean {
  return demoDisplayedTargetScore(score) && demo226StrategyAllowed(strategy);
}
