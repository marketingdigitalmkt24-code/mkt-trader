import { demoDisplayedTargetScore } from './demo-continuation.ts';
import { DEMO_CHALLENGERS } from './demo-new-strategies.ts';

// Oct 25 2026 17:51 UTC: Takashi no longer uses the 2.26 authorization (stays out of real/Telegram/copy).
export function demo226StrategyAllowed(strategy: unknown): boolean {
  return strategy === 'VELA_FORCA' || strategy === 'TENDENCIA';
}

export function demo226Authorized(score: number, strategy: unknown): boolean {
  return demoDisplayedTargetScore(score) && demo226StrategyAllowed(strategy);
}

// Oct 25 2026 19:02 UTC: Demo alternates Takashi entries with displayed-2.26 entries.
// Oct 26 2026 (user): Takashi only enters the Demo with a learned score above 4.
// The inverted principal sequence keeps its own authorization (any nonzero score).
export const TAKASHI_STRATEGY = 'TAKASHI_BNF_V1';
export const TAKASHI_DEMO_MIN_SCORE = 4;
export function takashiDemoAuthorized(score: number): boolean {
  return Number.isFinite(score);
}
// Oct 26 2026: Demo-only "Força antecipada" joins the rotation (never principal/Telegram/copy).
export const FORCA_ANTECIPADA_STRATEGY = 'FORCA_ANTECIPADA_V1';
// Nov 2 2026 (user): Ichimoku + Recuo na média 21 combined (both on the same closed candle, same
// direction) enter the Demo, competing with Takashi for the single Demo slot per minute.
// Demo-only: never principal/Telegram/copy. The separate ICHIMOKU/RECUO_EMA21 entries also run (user, Nov 2 2026).
export const ICHIMOKU_RECUO21_STRATEGY = 'ICHIMOKU_RECUO21';
// Nov 3 2026 (user): Tendência + Vela de força + Recuo combined on the same candle/direction (Demo only).
// Nov 3 2026 00:48 BRT (user): ONLY these four strategies enter the Demo (Takashi and the other
// standalone indicators no longer enter); Ichimoku + Recuo 21 keeps priority, the rest rotate.
export const TENDENCIA_ALINHADA_STRATEGY = 'TENDENCIA_ALINHADA';
// Nov 11 2026 (user): Queda forte joins Tendência alinhada in the Demo, following strong moves both ways.
export const QUEDA_STRATEGY = 'QUEDA_FORTE';
export const DEMO_STANDALONE_INDICATORS = [] as const;
export const DEMO_INDICATOR_STRATEGIES = [TENDENCIA_ALINHADA_STRATEGY, QUEDA_STRATEGY] as const;
export function isDemoIndicatorStrategy(strategy: unknown): boolean {
  return (DEMO_INDICATOR_STRATEGIES as readonly unknown[]).includes(strategy);
}
// Strategies that have Demo history: one shared gale progression and the Após 4 LOSS streak read all of them,
// so retiring a strategy from new Demo entries never breaks gale/streak continuity.
export const DEMO_ENTRY_STRATEGIES = [TAKASHI_STRATEGY, ...DEMO_INDICATOR_STRATEGIES, ICHIMOKU_RECUO21_STRATEGY, 'TENDENCIA_FORCA_RECUO', 'ICHIMOKU', 'RECUO_EMA21', ...DEMO_CHALLENGERS, 'TENDENCIA', 'VELA_FORCA', 'ROMPIMENTO', 'REVERSAO_RSI', 'KDJ'];
export type DemoCohort = 'takashi' | 'indicator' | 'score226' | 'antecipada';
export function demoCohort(_score: unknown, strategy: unknown): DemoCohort | null {
  // Nov 5 2026: notes no longer authorize, reject or rank any active Demo signal.
  if (isDemoIndicatorStrategy(strategy)) return 'indicator';
  return null;
}
export function demoAlternationAuthorized(score: unknown, strategy: unknown): boolean {
  return demoCohort(score, strategy) !== null;
}
// Rotate Takashi -> 2,26 -> Força antecipada; fall back so a minute is never wasted.
export function preferredDemoCohort(previousStrategy: unknown): DemoCohort {
  void previousStrategy;
  return 'takashi';
}
