import { expect, test } from 'bun:test';
import { measureDemoFilters } from './demo-filter-measurement.ts';

const target = Date.parse('2026-11-13T23:00:00Z');
const signal = { asset: 'EUR/USD', direction: 'CALL', payout: 0.83, signal_id: 'signal-1' };
const measurement = {
  entryMinute: new Date(target).toISOString(),
  picks: [{ strategy: 'TREND', reference: signal, model: null }],
};
const bars = Array.from({ length: 12 }, (_, i) => ({ t: target / 1000 + i * 5, o: 100, h: 102, l: 99, c: 101 }));
function storage() {
  const files = new Map<string, string>();
  return {
    files,
    async download(path: string) { return { data: files.has(path) ? new Blob([files.get(path)!]) : null, error: null }; },
    async upload(path: string, body: string) { files.set(path, body); return { error: null }; },
  };
}

test('measures a technical selection and a strict-filter skip using the same completed candles', async () => {
  const bucket = storage();
  const events: any[] = [];
  await measureDemoFilters(bucket, measurement, new Map(), target, () => target + 1000, e => events.push(e));
  await measureDemoFilters(bucket, { entryMinute: new Date(target + 60_000).toISOString(), picks: [] },
    new Map([[signal.asset, bars]]), target + 60_000, () => target + 61_000, e => events.push(e));
  expect(events.length).toBe(1);
  expect(events[0].basis).toBe('simulated_quotes_per_unit');
  expect(events[0].results[0].reference).toEqual({ status: 'win', netPerUnit: 0.83 });
  expect(events[0].results[0].model).toEqual({ status: 'no_entry' });
  await measureDemoFilters(bucket, { entryMinute: new Date(target + 120_000).toISOString(), picks: [] },
    new Map([[signal.asset, bars]]), target + 120_000, () => target + 121_000, e => events.push(e));
  expect(events.length).toBe(1);
});

test('retries absent candles and records an incomplete result without inventing a win or loss', async () => {
  const bucket = storage();
  const events: any[] = [];
  await measureDemoFilters(bucket, measurement, new Map(), target, () => target + 1000);
  await measureDemoFilters(bucket, { entryMinute: '', picks: [] }, new Map(), target + 60_000, () => target + 61_000, e => events.push(e));
  expect(events.length).toBe(0);
  await measureDemoFilters(bucket, { entryMinute: '', picks: [] }, new Map(), target + 300_000, () => target + 301_000, e => events.push(e));
  expect(events.length).toBe(1);
  expect(events[0].complete).toBe(false);
  expect(events[0].results[0].reference.status).toBe('missing_candles');
});

test('keeps paired ranking results separate from strict-filter measurements', async () => {
  const bucket = storage();
  const events: any[] = [];
  const ranking = { ...measurement, comparisonPolicy: 'previous-ranking-v7' as const, referencePolicy: 'demo-entry-quality-v8' };
  await measureDemoFilters(bucket, measurement, new Map(), target, () => target + 1000);
  await measureDemoFilters(bucket, ranking, new Map(), target, () => target + 1000);
  expect(bucket.files.size).toBe(2);
  await measureDemoFilters(bucket, { ...ranking, picks: [] }, new Map([[signal.asset, bars]]),
    target + 60_000, () => target + 61_000, e => events.push(e));
  expect(events.length).toBe(1);
  expect(events[0].comparisonPolicy).toBe('previous-ranking-v7');
  expect(events[0].referencePolicy).toBe('demo-entry-quality-v8');
  expect(bucket.files.size).toBe(3);
});
