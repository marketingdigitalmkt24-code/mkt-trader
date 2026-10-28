import { chartFeatures, type ChartSample } from './demo-continuation.ts';

type Candle = { t: number; o: number; c: number; h: number; l: number };
export type TakashiChartEvidence = ChartSample & { settled_at: string; direction: string };
export async function readTakashiChartEvidence(
  readOrders: (from: number, to: number) => Promise<Array<{ signal_id: string; result: string; settled_at: string | null }>>,
  readCharts: (ids: string[]) => Promise<Array<{ signal_id: string; asset: string; entry_minute: string; direction: string; candles: unknown }>>,
  targetMs: number,
): Promise<TakashiChartEvidence[]> {
  const outcomes = new Map<string, { result: string; settled_at: string }>();
  for (let from = 0; ; from += 1000) {
    const page = await readOrders(from, from + 999);
    for (const row of page) if (['win', 'loss'].includes(row.result) && row.settled_at && Date.parse(row.settled_at) <= targetMs) outcomes.set(row.signal_id, { result: row.result, settled_at: row.settled_at });
    if (page.length < 1000) break;
  }
  const evidence: TakashiChartEvidence[] = [];
  const ids = [...outcomes.keys()];
  for (let from = 0; from < ids.length; from += 200) {
    for (const row of await readCharts(ids.slice(from, from + 200))) {
      const outcome = outcomes.get(row.signal_id);
      if (!outcome || Date.parse(row.entry_minute) >= targetMs || !Array.isArray(row.candles)) continue;
      const f = chartFeatures(row.candles as Candle[], Date.parse(row.entry_minute) / 1000, row.direction);
      if (f?.every(Number.isFinite)) evidence.push({ ...outcome, f, signal_id: row.signal_id, asset: row.asset, entry_minute: row.entry_minute, direction: row.direction });
    }
  }
  return evidence;
}

export function takashiChartComparison(samples: TakashiChartEvidence[], candles: Candle[], entry: number, direction: string, asset: string) {
  const f = chartFeatures(candles, entry, direction);
  if (!f?.every(Number.isFinite)) return null;
  const near = samples.filter(s => s.direction === direction && s.f.length === f.length && Date.parse(s.settled_at) <= entry * 1000)
    .map(s => ({ s, distance: Math.sqrt(s.f.reduce((sum, v, i) => sum + (v - f[i]) ** 2, 0)) }))
    .sort((a, b) => a.distance - b.distance || String(a.s.signal_id).localeCompare(String(b.s.signal_id))).slice(0, 7);
  if (!near.length) return null;
  const winner = near.find(x => x.s.result === 'win');
  let weight = 0, net = 0;
  for (const { s, distance } of near) {
    const ageDays = Math.max(0, (entry * 1000 - Date.parse(s.settled_at)) / 86400000);
    const w = (s.asset === asset ? 1.25 : 1) / ((0.1 + distance) * (1 + ageDays / 14));
    weight += w; net += w * (s.result === 'win' ? 1 : -1.2);
  }
  return { affinity: net / weight, distance: winner?.distance ?? Infinity, samples: near.length,
    wins: near.filter(x => x.s.result === 'win').length, losses: near.filter(x => x.s.result === 'loss').length,
    reference: winner ? { signal_id: winner.s.signal_id, asset: winner.s.asset ?? null, entry_minute: winner.s.entry_minute ?? null, distance: winner.distance } : null };
}

// The displayed note is deliberately absent from this ordering contract.
export function compareTakashiCharts(a: { signal_id: string; chart: ReturnType<typeof takashiChartComparison> }, b: { signal_id: string; chart: ReturnType<typeof takashiChartComparison> }) {
  return (b.chart?.affinity ?? -Infinity) - (a.chart?.affinity ?? -Infinity)
    || (a.chart?.distance ?? Infinity) - (b.chart?.distance ?? Infinity) || a.signal_id.localeCompare(b.signal_id);
}