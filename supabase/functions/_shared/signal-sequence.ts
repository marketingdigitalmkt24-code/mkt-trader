import { freshSelectedTrend } from './selected-demo-trend.ts';
import { DEMO_ENTRY_STRATEGIES } from './demo-226-policy.ts';

// Principal "Sequência de 3 sinais" (user, Nov 3 2026): when the 3 latest confirmed Demo orders
// match one of the user's sets (strategy + direction + result, oldest first), the NEXT Demo signal
// opens on the principal IQ account following or inverting that signal's direction.
// Keep in sync with public.claim_after_signal_sequence.
export const SIGNAL_SEQUENCE = 'SEQUENCIA_3_SINAIS';
export const SIGNAL_SEQUENCE_LABEL = 'Sequência de 3 sinais';
export const SIGNAL_SEQUENCE_PREFIX = 'sequencia-3-v1-';

export type SequenceAction = 'follow' | 'inverted';
const R = 'RECUO_EMA21', T = 'TENDENCIA_FORCA_RECUO', I = 'ICHIMOKU_RECUO21';
// key = oldest|middle|newest as STRATEGY:DIRECTION:result
export const SIGNAL_SEQUENCES: Record<string, SequenceAction> = {
  [`${R}:CALL:loss|${T}:PUT:win|${R}:CALL:loss`]: 'inverted',
  [`${R}:PUT:loss|${T}:PUT:loss|${R}:CALL:win`]: 'follow',
  [`${I}:PUT:win|${T}:CALL:loss|${I}:PUT:win`]: 'follow',
  [`${R}:CALL:win|${T}:CALL:win|${R}:CALL:loss`]: 'inverted',
  [`${R}:CALL:loss|${T}:PUT:loss|${R}:CALL:win`]: 'follow',
  [`${R}:CALL:win|${T}:CALL:loss|${R}:CALL:win`]: 'follow',
  [`${R}:CALL:win|${T}:PUT:win|${R}:PUT:loss`]: 'inverted',
  [`${R}:PUT:win|${T}:CALL:loss|${R}:PUT:win`]: 'follow',
  [`${R}:CALL:win|${T}:PUT:loss|${I}:CALL:win`]: 'follow',
  [`${R}:PUT:win|${T}:PUT:win|${R}:PUT:loss`]: 'inverted',
  [`${R}:CALL:win|${T}:PUT:win|${I}:PUT:loss`]: 'inverted',
};

export interface SequenceOrder { status: string; result: string; entry_strategy: string; direction: string }

/** newestFirst: confirmed Demo orders before the candidate minute. */
export function signalSequenceAction(newestFirst: SequenceOrder[]): SequenceAction | null {
  const last = newestFirst.slice(0, 3);
  if (last.length !== 3 || last.some(o => o.status !== 'confirmed')) return null;
  const key = [...last].reverse().map(o => `${o.entry_strategy}:${String(o.direction).toUpperCase()}:${String(o.result).toLowerCase()}`).join('|');
  return SIGNAL_SEQUENCES[key] ?? null;
}

export function signalSequenceDirection(current: { entry_minute: string; entry_strategy: string; direction: string } | null,
  newestFirst: SequenceOrder[], now: number): 'call' | 'put' | null {
  if (!current || !(DEMO_ENTRY_STRATEGIES as readonly string[]).includes(current.entry_strategy)
    || !['CALL', 'PUT'].includes(current.direction) || !freshSelectedTrend(Date.parse(current.entry_minute), now)) return null;
  const action = signalSequenceAction(newestFirst);
  if (!action) return null;
  const same = current.direction === 'PUT' ? 'put' : 'call';
  return action === 'follow' ? same : same === 'put' ? 'call' : 'put';
}

export const isSignalSequenceSignal = (signalId: string) => signalId.startsWith(SIGNAL_SEQUENCE_PREFIX);
