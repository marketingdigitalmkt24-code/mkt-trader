import { freshSelectedTrend } from './selected-demo-trend.ts';

// Identifiers kept for history/Telegram/copy compatibility. Rule (user, Oct 31 2026): every fresh
// Takashi signal selected by Últimas operações · Demo opens the opposite direction on the principal IQ account.
export const TAKASHI_AFTER_226 = 'TAKASHI_APOS_226_INVERTIDA';
export const TAKASHI_AFTER_226_LABEL = 'Takashi invertida';
export const TAKASHI_AFTER_226_PREFIX = 'takashi_apos_226_invertida-v1-';

export interface SequenceCandidate {
  entry_minute: string; entry_strategy: string; direction: string; asset: string;
}

export function takashiAfter226Direction(current: SequenceCandidate | null, now: number): 'call' | 'put' | null {
  if (!current || current.entry_strategy !== 'TAKASHI_BNF_V1'
    || !['CALL', 'PUT'].includes(current.direction)
    || !freshSelectedTrend(Date.parse(current.entry_minute), now)) return null;
  return current.direction === 'PUT' ? 'call' : 'put';
}

export function isTakashiAfter226Signal(signalId: string): boolean {
  return signalId.startsWith(TAKASHI_AFTER_226_PREFIX);
}
