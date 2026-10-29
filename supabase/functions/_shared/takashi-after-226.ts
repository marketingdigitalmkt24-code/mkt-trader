import { freshSelectedTrend } from './selected-demo-trend.ts';

// Identifiers kept for history/Telegram compatibility. Rule: after a confirmed Takashi Demo WIN,
// if the next Takashi signal is on the same asset, enter the opposite direction on the principal IQ account.
export const TAKASHI_AFTER_226 = 'TAKASHI_APOS_226_INVERTIDA';
export const TAKASHI_AFTER_226_LABEL = 'Takashi invertida após WIN';
export const TAKASHI_AFTER_226_PREFIX = 'takashi_apos_226_invertida-v1-';

export interface SequenceCandidate {
  entry_minute: string; entry_strategy: string; direction: string; asset: string;
}
export interface PreviousTakashiOrder {
  entry_minute: string; entry_strategy: string; asset: string; status: string; iq_option_id: string | null; result: string | null;
}

export function takashiAfter226Direction(
  current: SequenceCandidate | null,
  previous: PreviousTakashiOrder | null,
  now: number,
): 'call' | 'put' | null {
  if (!current || !previous || current.entry_strategy !== 'TAKASHI_BNF_V1'
    || !['CALL', 'PUT'].includes(current.direction)
    || !freshSelectedTrend(Date.parse(current.entry_minute), now)
    || previous.entry_strategy !== 'TAKASHI_BNF_V1'
    || Date.parse(previous.entry_minute) >= Date.parse(current.entry_minute)
    || previous.asset !== current.asset || previous.result !== 'win'
    || previous.status !== 'confirmed' || !/^\d+$/.test(previous.iq_option_id || '')) return null;
  return current.direction === 'PUT' ? 'call' : 'put';
}

export function isTakashiAfter226Signal(signalId: string): boolean {
  return signalId.startsWith(TAKASHI_AFTER_226_PREFIX);
}
