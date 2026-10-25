import { demoDisplayedTargetScore } from './demo-continuation.ts';
import { TAKASHI_BNF } from './takashi-kotegawa.ts';

export function demo226StrategyAllowed(strategy: unknown): boolean {
  return strategy === 'VELA_FORCA' || strategy === 'TENDENCIA' || strategy === TAKASHI_BNF;
}

export function demo226Authorized(score: number, strategy: unknown): boolean {
  return demoDisplayedTargetScore(score) && demo226StrategyAllowed(strategy);
}