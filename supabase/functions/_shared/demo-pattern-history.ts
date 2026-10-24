import { chartFeatures, type ChartSample } from './demo-continuation.ts';

type Order = { signal_id: string; result: string; profit: number | string; status: string; account_type: string; iq_option_id: string | null };
type Chart = { signal_id: string; asset: string; entry_minute: string; direction: string; score: number; candles: unknown };
// Read every confirmed broker page; chart features exclude the outcome candle.
export async function readDemoPatternHistory(
  readPage: (from: number, to: number) => Promise<Order[]>,
  readCharts: (ids: string[]) => Promise<Chart[]>,
): Promise<ChartSample[]> {
  const samples: ChartSample[] = [];
  const seen = new Set<string>();
  for (let from = 0; ; from += 500) {
    const page = await readPage(from, from + 499);
    const orders = page.filter(o => o.status === 'confirmed' && o.account_type === 'PRACTICE'
      && o.iq_option_id && /^\d+$/.test(o.iq_option_id) && ['win', 'loss'].includes(o.result));
    const outcomes = new Map(orders.map(o => [o.signal_id, o]));
    for (let i = 0; i < orders.length; i += 100) {
      const charts = await readCharts(orders.slice(i, i + 100).map(o => o.signal_id));
      for (const chart of charts) {
        const outcome = outcomes.get(chart.signal_id);
        if (!outcome || seen.has(chart.signal_id) || !Array.isArray(chart.candles)) continue;
        const f = chartFeatures(chart.candles, Date.parse(chart.entry_minute) / 1000, chart.direction);
        if (!f || !f.every(Number.isFinite)) continue;
        seen.add(chart.signal_id);
        samples.push({ f, result: outcome.result, profit: Number(outcome.profit), score: chart.score,
          signal_id: chart.signal_id, asset: chart.asset, entry_minute: chart.entry_minute });
      }
    }
    if (page.length < 500) return samples;
  }
}