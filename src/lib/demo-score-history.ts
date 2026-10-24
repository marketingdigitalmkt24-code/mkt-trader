import { demoTestStats, type DemoOutcomeRow } from './demo-test-stats';

export interface DemoScoreOrder extends DemoOutcomeRow {
 id: string;
 signal_id: string;
 entry_minute: string;
 settled_at: string | null;
 score: number | null;
}
export function displayedDemoScore(score: number | null): string {
 return score != null && Number.isFinite(score) ? score.toFixed(2) : 'unscored';
}
export function scoreHistory(rows: DemoScoreOrder[]) {
 const confirmed = rows.filter(r => r.status === 'confirmed' && r.iq_option_id && /^\d+$/.test(r.iq_option_id));
 const groups = new Map<string, DemoScoreOrder[]>();
 for (const row of confirmed) {
  const key = displayedDemoScore(row.score);
  groups.set(key, [...(groups.get(key) ?? []), row]);
 }
 const byScore = [...groups].map(([score, orders]) => ({ score, orders: orders.length, ...demoTestStats(orders) }));
 let profit = 0, wins = 0, losses = 0;
 const timeline = confirmed.filter(r => ['win', 'loss', 'tie'].includes(r.result))
  .sort((a,b) => Date.parse(a.settled_at ?? a.entry_minute) - Date.parse(b.settled_at ?? b.entry_minute) || a.id.localeCompare(b.id))
  .map(row => {
   if (row.result === 'win') wins++;
   if (row.result === 'loss') losses++;
   const amount = Number(row.profit);
   if (Number.isFinite(amount)) profit += amount;
   return { at: Date.parse(row.settled_at ?? row.entry_minute), profit: Math.round(profit * 100) / 100,
    accuracy: wins + losses ? 100 * wins / (wins + losses) : 0 };
  });
 return { byScore, timeline, totals: demoTestStats(confirmed), count: confirmed.length };
}
export function filterScoreHistory(rows: DemoScoreOrder[], period: string, score: string, now = Date.now()) {
 const brtDate = (at: number) => new Date(at).toISOString().slice(0, 10);
 const today = brtDate(now - 3 * 3600000);
 return rows.filter(row => {
  if (score !== 'all' && displayedDemoScore(row.score) !== score) return false;
  const at = Date.parse(row.entry_minute);
  if (period === 'today') return brtDate(at - 3 * 3600000) === today;
  if (period === '7d') return at >= now - 7 * 86400000;
  return true;
 });
}
export async function readDemoScoreHistory(
 readPage: (from: number, to: number) => Promise<Omit<DemoScoreOrder, 'score'>[]>,
 readScores: (ids: string[]) => Promise<{signal_id: string; score: number | null}[]>,
) {
 const orders: Omit<DemoScoreOrder, 'score'>[] = [];
 for (let from = 0; ; from += 1000) {
  const page = await readPage(from, from + 999);
  orders.push(...page);
  if (page.length < 1000) break;
 }
 const ids = [...new Set(orders.map(r => r.signal_id))];
 const scores = new Map<string, number | null>();
 for (let from = 0; from < ids.length; from += 200) {
  for (const row of await readScores(ids.slice(from, from + 200))) scores.set(row.signal_id, row.score);
 }
 return orders.map(r => ({ ...r, score: scores.get(r.signal_id) ?? null }));
}