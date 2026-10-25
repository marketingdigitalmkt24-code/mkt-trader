import { freshSelectedTrend } from './selected-demo-trend.ts';

export const TAKASHI_AFTER_226 = 'TAKASHI_APOS_226_INVERTIDA';
export const TAKASHI_AFTER_226_LABEL = 'Takashi invertida';
export const TAKASHI_AFTER_226_PREFIX = 'takashi_apos_226_invertida-v1-';

export interface SequenceCandidate {
  entry_minute: string; entry_strategy: string; direction: string; score: number;
}

export function takashiAfter226Direction(
  current: SequenceCandidate | null,
  previous: (SequenceCandidate & { status: string; iq_option_id: string | null }) | null,
  now: number,
): 'call' | 'put' | null {
  if (!current || !previous || current.entry_strategy !== 'TAKASHI_BNF_V1'
    || !['CALL', 'PUT'].includes(current.direction)
    || !freshSelectedTrend(Date.parse(current.entry_minute), now)
    || Date.parse(previous.entry_minute) !== Date.parse(current.entry_minute) - 60000
    || !['VELA_FORCA', 'TENDENCIA'].includes(previous.entry_strategy)
    || !Number.isFinite(previous.score) || Math.round(previous.score * 100) !== 226
    || previous.status !== 'confirmed' || !/^\d+$/.test(previous.iq_option_id || '')) return null;
  return current.direction === 'PUT' ? 'call' : 'put';
}

export function isTakashiAfter226Signal(signalId: string): boolean {
  return signalId.startsWith(TAKASHI_AFTER_226_PREFIX);
}