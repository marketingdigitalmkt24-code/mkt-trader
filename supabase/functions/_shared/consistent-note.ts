import { freshSelectedTrend } from './selected-demo-trend.ts';

export const CONSISTENT_NOTE = 'NOTA_CONSISTENTE';
export const CONSISTENT_NOTE_LABEL = 'Nota consistente';
export const CONSISTENT_NOTE_PREFIX = 'nota-consistente-v1-';

export interface ConsistentNoteCandidate {
 signal_id: string; entry_strategy: string; direction: string; entry_minute: string; score: number;
}
export interface ConsistentNoteEvidence {
 signal_id: string; entry_strategy: string; entry_minute: string; settled_at: string | null;
 score: number | null; status: string; account_type: string; iq_option_id: string | null; result: string;
}
const dayBrt = (at: number) => new Date(at - 3 * 3600000).toISOString().slice(0, 10);
const displayedScore = (score: number) => score.toFixed(2);

// Read-only policy. Activation additionally requires the service-only atomic claim;
// never use this calculation alone to submit an IQ order or reserve a client copy.
export function consistentNoteDirection(candidate: ConsistentNoteCandidate | null, rows: ConsistentNoteEvidence[], now: number): 'call' | 'put' | null {
 if (!candidate || candidate.entry_strategy !== 'TAKASHI_BNF_V1' || !candidate.signal_id.startsWith('takashi-bnf-v1-')
  || !['CALL','PUT'].includes(candidate.direction) || !Number.isFinite(candidate.score)
  || !freshSelectedTrend(Date.parse(candidate.entry_minute), now)) return null;
 const targetAt = Date.parse(candidate.entry_minute);
 const required = new Set([dayBrt(now), dayBrt(now - 86400000), dayBrt(now - 2 * 86400000)]);
 const wonDays = new Set<string>();
 for (const row of rows) {
  if (row.entry_strategy !== candidate.entry_strategy || row.status !== 'confirmed'
   || !['PRACTICE','REAL'].includes(row.account_type) || !/^\d+$/.test(row.iq_option_id ?? '')
   || row.score == null || !Number.isFinite(row.score) || displayedScore(row.score) !== displayedScore(candidate.score)) continue;
  // All-history LOSS veto matches the eligible strategy+displayed-note summary.
  if (row.result === 'loss') return null;
  const settled = Date.parse(row.settled_at ?? '');
  const entered = Date.parse(row.entry_minute);
  if (row.result !== 'win' || !Number.isFinite(settled) || settled > now || !Number.isFinite(entered) || entered >= targetAt) continue;
  const day = dayBrt(entered);
  if (required.has(day)) wonDays.add(day);
 }
 return wonDays.size === 3 ? (candidate.direction === 'CALL' ? 'call' : 'put') : null;
}
export function isConsistentNoteSignal(signalId: string): boolean {
 return signalId.startsWith(CONSISTENT_NOTE_PREFIX);
}
