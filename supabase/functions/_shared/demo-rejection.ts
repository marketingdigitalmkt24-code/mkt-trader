import { DEMO_LEARNED_REJECT, DEMO_MIN_SCORE, DEMO_REFERENCE_MAX_DISTANCE, demoLearnedReject, demoScoreAllowed, demoPreferredPatternAllowed } from './demo-continuation.ts';

export type RejectionReason = { code: string; details: Record<string, number | string | null> };
export function demoRejectionReason(input: { learned?: number; score: number; referenceMatch?: boolean; patternDistance?: number; priorityAvailable?: boolean; winner?: string | null; signalId?: string }): RejectionReason | null {
  if (input.learned !== undefined && demoLearnedReject(input.learned)) return { code: 'learned_history', details: { learned: input.learned, maximum: DEMO_LEARNED_REJECT } };
  if (!demoScoreAllowed(input.score)) return { code: 'score_floor', details: { score: Number.isFinite(input.score) ? input.score : null, minimum: DEMO_MIN_SCORE } };
  // GEV is retired as a gate; a confirmed WIN match alone provides chart eligibility.
  if (input.patternDistance !== undefined && !demoPreferredPatternAllowed(input.patternDistance)) return { code: 'eight_pattern_mismatch', details: { distance: Number.isFinite(input.patternDistance) ? input.patternDistance : null, maximum_distance: DEMO_REFERENCE_MAX_DISTANCE } };
  if (input.priorityAvailable === false) return { code: 'priority_unavailable', details: {} };
  if (input.winner && input.winner !== input.signalId) return { code: 'minute_priority', details: { selected_signal: input.winner } };
  return null;
}