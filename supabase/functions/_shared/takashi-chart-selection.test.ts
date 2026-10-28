import { expect, test } from 'bun:test';
import { chartFeatures } from './demo-continuation.ts';
import { compareTakashiCharts, readTakashiChartEvidence, takashiChartComparison } from './takashi-chart-selection.ts';
const entry = 180000;
const candles = Array.from({ length: 20 }, (_, i) => ({ t: entry - (20 - i) * 60, o: 100 + i, c: 100.5 + i, h: 101 + i, l: 99.5 + i }));
const f = chartFeatures(candles, entry, 'CALL') ?? [];
const evidence = (result: string, settled = entry * 1000 - 60000) => ({ f, result, direction: 'CALL', signal_id: result, asset: 'A', entry_minute: new Date(entry * 1000 - 120000).toISOString(), settled_at: new Date(settled).toISOString() });
test('compares current IQ candles with confirmed wins and penalizes losses', () => {
  const win = takashiChartComparison([evidence('win')], candles, entry, 'CALL', 'A');
  const loss = takashiChartComparison([evidence('loss')], candles, entry, 'CALL', 'A');
  expect(win?.affinity).toBe(1); expect(loss?.affinity).toBeCloseTo(-1.2); expect(win?.reference?.signal_id).toBe('win');
});
test('selection never prioritizes a higher displayed note', () => {
  const better = { signal_id: 'better', _score: 0, chart: takashiChartComparison([evidence('win')], candles, entry, 'CALL', 'A') };
  const worse = { signal_id: 'worse', _score: 99, chart: takashiChartComparison([evidence('loss')], candles, entry, 'CALL', 'A') };
  expect([worse, better].sort(compareTakashiCharts)[0].signal_id).toBe('better');
});
test('future results and the entry candle cannot teach a pre-entry decision', () => {
  expect(takashiChartComparison([evidence('win', entry * 1000 + 1)], candles, entry, 'CALL', 'A')).toBeNull();
  expect(takashiChartComparison([evidence('win')], [...candles, { t: entry, o: 1, c: 999, h: 999, l: 1 }], entry, 'CALL', 'A')).toEqual(takashiChartComparison([evidence('win')], candles, entry, 'CALL', 'A'));
});
test('reads later pages and joins charts by exact signal, not score', async () => {
  let pages = 0;
  const rows = await readTakashiChartEvidence(async from => { pages++; return from === 0 ? Array.from({ length: 1000 }, (_, i) => ({ signal_id: `a${i}`, result: 'win', settled_at: null })) : [{ signal_id: 'last', result: 'loss', settled_at: new Date(entry * 1000 - 1).toISOString() }]; }, async ids => ids.includes('last') ? [{ signal_id: 'last', asset: 'A', entry_minute: new Date((entry - 60) * 1000).toISOString(), direction: 'CALL', candles: candles.map(k => ({ ...k, t: k.t - 60 })) }] : [], entry * 1000);
  expect(pages).toBe(2); expect(rows.map(r => r.signal_id)).toEqual(['last']);
});