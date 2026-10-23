export interface DemoOutcomeRow {
 status: string;
 result: string;
 profit: number | string;
 iq_option_id: string | null;
}
export function demoTestStats(rows: DemoOutcomeRow[]) {
 let wins = 0, losses = 0, ties = 0, pending = 0, profit = 0;
 for (const row of rows) {
  if (row.status !== 'confirmed' || !row.iq_option_id || !/^\d+$/.test(row.iq_option_id)) continue;
  if (row.result === 'pending') { pending++; continue; }
  if (!['win', 'loss', 'tie'].includes(row.result)) continue;
  if (row.result === 'win') wins++;
  if (row.result === 'loss') losses++;
  if (row.result === 'tie') ties++;
  const amount = Number(row.profit);
  if (Number.isFinite(amount)) profit += amount;
 }
 return { wins, losses, ties, pending, accuracy: wins + losses ? 100 * wins / (wins + losses) : 0,
  profit: Math.round(profit * 100) / 100 };
}
export async function allDemoOutcomes(readPage: (from: number, to: number) => Promise<DemoOutcomeRow[]>) {
 const rows: DemoOutcomeRow[] = [];
 for (let from = 0; ; from += 1000) {
  const page = await readPage(from, from + 999);
  rows.push(...page);
  if (page.length < 1000) return rows;
 }
}