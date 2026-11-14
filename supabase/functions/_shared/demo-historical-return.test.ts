import { expect, test } from 'bun:test';
import { buildDemoHistory, demoHistoricalEvidence, demoPracticeLossPace, readAllDemoHistoricalOrders, type DemoHistoricalOrder } from './demo-historical-return.ts';

const target = Date.parse('2026-11-13T03:05:00Z'); // 00:05 in Brasília, a different UTC date from most sample entries.
const candidate = { entry_strategy: 'TREND', asset: 'EUR/USD-OTC', direction: 'CALL', payout: 0.85 };
function order(index: number, result: 'win' | 'loss' | 'tie' = 'win'): DemoHistoricalOrder {
  const entry = Date.parse('2026-11-12T03:00:00Z') + (Math.floor(index / 6) * 30 + index % 6) * 60_000;
  return {
    ...candidate, iq_option_id: String(index + 100), account_type: 'PRACTICE', status: 'confirmed',
    entry_minute: new Date(entry).toISOString(), expiration_time: new Date(entry + 60_000).toISOString(),
    settled_at: new Date(entry + 62_000).toISOString(), amount: 2,
    result, profit: result === 'win' ? 1.7 : result === 'loss' ? -2 : 0,
  };
}
const sample = (wins: number) => Array.from({ length: 36 }, (_, i) => order(i, i < wins ? 'win' : 'loss'));
const assess = (rows: DemoHistoricalOrder[], signal = candidate) =>
  demoHistoricalEvidence(buildDemoHistory(rows, target), signal, target);

test('matches strategy, direction, OTC class and four-hour Brasília window, not the exact asset', () => {
  const history = buildDemoHistory(sample(29), target);
  expect(demoHistoricalEvidence(history, { ...candidate, asset: 'GBP/USD-OTC' }, target).wins).toBe(29);
  expect(demoHistoricalEvidence(history, { ...candidate, entry_strategy: 'OTHER' }, target).weight).toBe(0);
  expect(demoHistoricalEvidence(history, { ...candidate, direction: 'PUT' }, target).weight).toBe(0);
  expect(demoHistoricalEvidence(history, { ...candidate, asset: 'EUR/USD' }, target).weight).toBe(0);
  expect(demoHistoricalEvidence(history, candidate, target + 4 * 3_600_000).weight).toBe(0);
});

test('measures negative stake-weighted net return despite a high win rate, including ties in stake', () => {
  const rows = sample(32).map(o => o.result === 'loss' ? { ...o, amount: '40', profit: '-40' } : o);
  const result = assess([...rows, order(36, 'tie')]);
  expect(result.ties).toBe(1);
  expect(result.netReturn).toBeCloseTo((32 * 1.7 - 4 * 40) / (32 * 2 + 4 * 40 + 2), 8);
});

test('reduces the weight of thin and concentrated samples and uses zero weight without history', () => {
  const oneBlock = sample(36).map((o, i) => ({ ...order(0), iq_option_id: o.iq_option_id, asset: 'ASSET' + i + '-OTC' }));
  expect(assess(sample(36).slice(0, 5)).weight).toBeLessThan(0.03);
  expect(assess(oneBlock).weight).toBeLessThan(0.1);
  expect(assess(sample(36)).weight).toBeGreaterThan(0.5);
  expect(demoHistoricalEvidence(null, candidate, target).weight).toBe(0);
});

test('excludes future, unsettled, duplicate, real-account and invalid ledger rows', () => {
  const base = order(0);
  const rows: DemoHistoricalOrder[] = [
    base, base,
    { ...order(1), settled_at: new Date(target).toISOString() },
    { ...order(2), settled_at: new Date(target + 1).toISOString() },
    { ...order(3), settled_at: null },
    { ...order(4), account_type: 'REAL' },
    { ...order(5), status: 'unknown' },
    { ...order(6), iq_option_id: 'not-confirmed' },
    { ...order(7), profit: null },
    { ...order(8), amount: 0 },
    { ...order(9), profit: -1 },
    { ...order(10), expiration_time: base.expiration_time },
    { ...order(11), entry_minute: 'invalid', expiration_time: '2026-10-28T03:01:00Z' },
    { ...order(12), settled_at: '2026-11-12T03:00:00Z' },
  ];
  expect(buildDemoHistory(rows, target).count).toBe(1);
});

test('includes older history and prefers asset-specific evidence when sufficiently sampled', () => {
  const rows = sample(29);
  const older = rows.map((row, i) => ({
    ...row, iq_option_id: String(1000 + i), asset: 'GBP/USD-OTC',
    entry_minute: new Date(Date.parse(row.entry_minute) - 30 * 86400_000).toISOString(),
    expiration_time: new Date(Date.parse(row.expiration_time!) - 30 * 86400_000).toISOString(),
    settled_at: new Date(Date.parse(row.settled_at!) - 30 * 86400_000).toISOString(),
  }));
  const history = buildDemoHistory([...rows, ...older], target);
  expect(history.count).toBe(72);
  const exact = demoHistoricalEvidence(history, { ...candidate, asset: 'GBP/USD-OTC' }, target);
  expect(exact.scope).toBe('same_asset_direction_session');
  expect(exact.wins).toBe(29);
  expect(exact.recentDecisive).toBe(0);
  expect(demoHistoricalEvidence(history, { ...candidate, asset: 'AUD/USD-OTC' }, target).wins).toBe(58);
});

test('reads beyond the first thousand rows using a stable cursor', async () => {
  const rows = Array.from({ length: 2050 }, (_, i) => ({
    id: String(3000 - i).padStart(4, '0'), entry_minute: '2026-11-12T03:00:00Z',
  }));
  let pages = 0;
  const all = await readAllDemoHistoricalOrders(async cursor => {
    pages++;
    const from = cursor ? rows.findIndex(row => row.id === cursor.id) + 1 : 0;
    return rows.slice(from, from + 1000);
  });
  expect(all.length).toBe(2050);
  expect(pages).toBe(3);
});

test('provides a small bounded asset weight before twenty results are available', () => {
  const result = assess(sample(29).slice(0, 5));
  expect(result.assetWins).toBe(5);
  expect(result.assetWeight).toBeGreaterThan(0);
  expect(result.assetWeight).toBeLessThan(0.1);
});

test('paces losses only for the affected strategy and releases it after five minutes', () => {
  const noon = Date.parse('2026-11-13T15:00:00Z');
  const rows = Array.from({ length: 12 }, (_, i) => {
    const entry = noon - (i + 2) * 60_000;
    return {
      ...order(i, 'loss'), entry_minute: new Date(entry).toISOString(),
      expiration_time: new Date(entry + 60_000).toISOString(), settled_at: new Date(entry + 62_000).toISOString(),
    };
  });
  const history = buildDemoHistory(rows, noon);
  expect(demoPracticeLossPace(history, 'TREND', noon, -0.05).waitMs).toBe(180_000);
  expect(demoPracticeLossPace(history, 'TREND', noon, 0.01).waitMs).toBe(0);
  expect(demoPracticeLossPace(history, 'TREND', noon, null).waitMs).toBe(0);
  expect(demoPracticeLossPace(history, 'OTHER', noon, -0.05).waitMs).toBe(0);
  expect(demoPracticeLossPace(buildDemoHistory(rows.slice(1), noon), 'TREND', noon, -0.05).waitMs).toBe(0);
  expect(demoPracticeLossPace(buildDemoHistory(rows, noon + 180_000), 'TREND', noon + 180_000, -0.05).waitMs).toBe(0);
});
