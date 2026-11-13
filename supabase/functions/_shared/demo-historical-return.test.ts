import { expect, test } from 'bun:test';
import { assessDemoHistoricalReturn, buildDemoHistory, type DemoHistoricalOrder } from './demo-historical-return.ts';

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
  assessDemoHistoricalReturn(buildDemoHistory(rows, target), signal, target);

test('matches strategy, direction, OTC class and four-hour Brasília window, not the exact asset', () => {
  const history = buildDemoHistory(sample(29), target);
  expect(assessDemoHistoricalReturn(history, { ...candidate, asset: 'GBP/USD-OTC' }, target).code).toBe(null);
  expect(assessDemoHistoricalReturn(history, { ...candidate, entry_strategy: 'OTHER' }, target).code).toBe('history_insufficient');
  expect(assessDemoHistoricalReturn(history, { ...candidate, direction: 'PUT' }, target).code).toBe('history_insufficient');
  expect(assessDemoHistoricalReturn(history, { ...candidate, asset: 'EUR/USD' }, target).code).toBe('history_insufficient');
  expect(assessDemoHistoricalReturn(history, candidate, target + 4 * 3_600_000).code).toBe('history_insufficient');
});

test('admits positive history with headroom and vetoes the same sample at a lower payout', () => {
  const rows = sample(29);
  const decision = assess(rows);
  expect(decision.code).toBe(null);
  expect(decision.details.conservative_return! > 0.02).toBe(true);
  expect(assess(rows, { ...candidate, payout: 0.40 }).code).toBe('history_margin_insufficient');
  expect(assess(rows, { ...candidate, payout: Number.NaN }).code).toBe('history_payout_unavailable');
});

test('blocks negative stake-weighted net return despite a high win rate, including ties in stake', () => {
  const rows = sample(32).map(o => o.result === 'loss' ? { ...o, amount: '40', profit: '-40' } : o);
  const result = assess([...rows, order(36, 'tie')]);
  expect(result.code).toBe('history_nonpositive');
  expect(result.details.ties).toBe(1);
  expect(result.details.net_return).toBeCloseTo((32 * 1.7 - 4 * 40) / (32 * 2 + 4 * 40 + 2), 8);
});

test('rejects small or concentrated samples even with only wins, and fails closed on read failure', () => {
  expect(assess(sample(36).slice(0, 29)).code).toBe('history_insufficient');
  const oneBlock = sample(36).map((o, i) => ({ ...order(0), iq_option_id: o.iq_option_id, asset: 'ASSET' + i + '-OTC' }));
  expect(assess(oneBlock).code).toBe('history_insufficient');
  expect(assessDemoHistoricalReturn(null, candidate, target).code).toBe('history_unavailable');
});

test('excludes future, stale, unsettled, duplicate, real-account and invalid ledger rows', () => {
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
    { ...order(11), entry_minute: '2026-10-28T03:00:00Z', expiration_time: '2026-10-28T03:01:00Z' },
    { ...order(12), settled_at: '2026-11-12T03:00:00Z' },
  ];
  expect(buildDemoHistory(rows, target).count).toBe(1);
});
