import { recentLearningAdjustment, type LearningOutcome } from './recent-signal-learning.ts';
import { TAKASHI_BNF } from './takashi-kotegawa.ts';

export const TAKASHI_RECENT_DAYS = 14;
export const TAKASHI_RECENT_LIMIT = 500;
export type TakashiRecentOrder = {
  signal_id: string; entry_strategy: string; asset: string; direction: string;
  entry_minute: string; settled_at: string | null; status: string;
  account_type: string; iq_option_id: string | null; result: string;
};
export function takashiRecentEvidence(rows: TakashiRecentOrder[], entryMs: number, observedMs: number): LearningOutcome[] {
  const seen = new Set<string>();
  return rows.filter(row => row.entry_strategy === TAKASHI_BNF && row.status === 'confirmed'
    && row.account_type === 'PRACTICE' && /^\d+$/.test(row.iq_option_id ?? '')
    && ['win', 'loss'].includes(row.result) && ['CALL', 'PUT'].includes(row.direction)
    && Date.parse(row.entry_minute) >= entryMs - TAKASHI_RECENT_DAYS * 86400000
    && Date.parse(row.entry_minute) < entryMs && row.settled_at !== null
    && Date.parse(row.settled_at) <= observedMs)
    .sort((a,b) => Date.parse(b.entry_minute) - Date.parse(a.entry_minute) || a.signal_id.localeCompare(b.signal_id))
    .filter(row => { if(seen.has(row.signal_id))return false;seen.add(row.signal_id);return true; })
    .slice(0, TAKASHI_RECENT_LIMIT)
    .map(row => ({ asset: row.asset, direction: row.direction, entry_strategy: row.entry_strategy,
      result: row.result, created_at: row.entry_minute }));
}
export async function readTakashiRecentOrders(readPage: (from: number, to: number) => Promise<TakashiRecentOrder[]>) {
  const rows: TakashiRecentOrder[] = [];
  for(let from=0; from<TAKASHI_RECENT_LIMIT; from+=200) {
    const to=Math.min(from+199,TAKASHI_RECENT_LIMIT-1);
    const page=await readPage(from,to);
    rows.push(...page);
    if(page.length<to-from+1)break;
  }
  return rows.slice(0,TAKASHI_RECENT_LIMIT);
}
export function takashiRecentAdjustment(rows: TakashiRecentOrder[], candidate: { asset: string; direction: string }, entryMs: number, observedMs: number) {
  return recentLearningAdjustment(takashiRecentEvidence(rows,entryMs,observedMs),
    { ...candidate, entry_strategy: TAKASHI_BNF }, entryMs);
}