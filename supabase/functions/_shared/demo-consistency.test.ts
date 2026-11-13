import { expect, test } from 'bun:test';
import { DEMO_CONSISTENCY_START, demoConsistencyBudget, demoConsistencySignal, type ConsistencyOrder } from './demo-consistency.ts';

const target = Date.parse('2026-11-14T02:50:00Z'); // Still Nov 13 in Brasília.
const signal = {
  quality: 85, payout: 0.86,
  candleContext: { bodyShare: 0.7, rangeMultiple: 1.2, minuteMove: 0.1, minuteEfficiency: 0.6 },
};
const supported = { wins: 23, losses: 7, halfHourBlocks: 5, netReturn: 0.2 };
const thin = { wins: 1, losses: 0, halfHourBlocks: 1, netReturn: 0.86 };
function order(i: number, minutesAgo = 35): ConsistencyOrder {
  const entry = target - (minutesAgo + i * 35) * 60_000;
  return {
    id: String(i), entry_strategy: 'TREND', entry_minute: new Date(entry).toISOString(),
    account_type: 'PRACTICE', status: 'confirmed', result: 'win', iq_option_id: String(i + 100),
    profit: 1.7, settled_at: new Date(entry + 62_000).toISOString(),
  };
}

test('requires confirmed body, orderly range, directional minute and sufficient payout', () => {
  expect(demoConsistencySignal(signal, supported, 0.05, 0).reason).toBeNull();
  expect(demoConsistencySignal({ ...signal, payout: 0.79 }, supported, 0.05, 0).reason?.code).toBe('selective_payout');
  expect(demoConsistencySignal({ ...signal, quality: 69 }, supported, 0.05, 0).reason?.code).toBe('selective_quality');
  expect(demoConsistencySignal({ ...signal, candleContext: { ...signal.candleContext, bodyShare: 0.49 } }, supported, 0.05, 0).reason?.code).toBe('selective_candle_body');
  expect(demoConsistencySignal({ ...signal, candleContext: { ...signal.candleContext, rangeMultiple: 2 } }, supported, 0.05, 0).reason?.code).toBe('selective_candle_range');
  expect(demoConsistencySignal({ ...signal, candleContext: { ...signal.candleContext, minuteEfficiency: 0.2 } }, supported, 0.05, 0).reason?.code).toBe('selective_minute_confirmation');
});

test('does not expand the quota by placing exploratory orders without supported history', () => {
  expect(demoConsistencySignal(signal, thin, null, 0).reason?.code).toBe('selective_history_insufficient');
  expect(demoConsistencySignal(signal, thin, 0.05, 1).reason?.code).toBe('selective_history_insufficient');
});

test('requires positive measured net return and projected headroom once history is supported', () => {
  expect(demoConsistencySignal(signal, { ...supported, netReturn: -0.02 }, 0.1, 0).reason?.code).toBe('selective_return');
  expect(demoConsistencySignal(signal, supported, 0.01, 0).reason?.code).toBe('selective_return');
  expect(demoConsistencySignal(signal, supported, null, 0).reason?.code).toBe('selective_return');
  expect(demoConsistencySignal(signal, supported, 0.02, 3).reason).toBeNull();
  expect(demoConsistencySignal(signal, { ...supported, recentDecisive: 25, recentNetReturn: -0.1 }, 0.05, 3).reason?.code).toBe('selective_recent_return');
});

test('enforces one hundred daily slots and one-minute spacing while permitting entries after losses', () => {
  expect(demoConsistencyBudget([order(0, 0.5)], 'TREND', target).reason?.code).toBe('selective_spacing');
  expect(demoConsistencyBudget([order(0, 1)], 'TREND', target).reason).toBeNull();
  const rows = Array.from({ length: 100 }, (_, i) => ({ ...order(i), entry_minute: new Date(target - (i + 1) * 60_000).toISOString() }));
  expect(demoConsistencyBudget(rows.slice(0, 99), 'TREND', target).reason).toBeNull();
  expect(demoConsistencyBudget(rows, 'TREND', target).reason?.code).toBe('selective_daily_entry_limit');
  const losses = [0, 1].map(i => ({ ...order(i), result: 'loss', profit: -2 }));
  const afterLosses = demoConsistencyBudget(losses, 'TREND', target);
  expect(afterLosses.reason).toBeNull();
  expect(afterLosses.losses).toBe(2);
  expect(afterLosses.lossPauseEnabled).toBe(false);
  expect(demoConsistencyBudget(losses, 'SECOND_CARD', target).reason).toBeNull();
  const streak = Array.from({ length: 8 }, (_, i) => ({ ...order(i, 1), result: 'loss', profit: -2 }));
  expect(demoConsistencyBudget(streak, 'TREND', target).reason).toBeNull();
});

test('counts ambiguous reservations, ignores failed attempts and resets at Brasília midnight', () => {
  const rows = [
    { ...order(0), status: 'unknown', result: 'pending', iq_option_id: null },
    { ...order(1), status: 'reserved', result: 'pending', iq_option_id: null },
    order(2), order(2), { ...order(3), status: 'failed' }, { ...order(4), account_type: 'REAL' },
  ];
  expect(demoConsistencyBudget(rows, 'TREND', target).entries).toBe(3);
  expect(demoConsistencyBudget(rows, 'TREND', Date.parse('2026-11-14T03:00:00Z')).entries).toBe(0);
  expect(demoConsistencyBudget(null, 'TREND', target).reason?.code).toBe('selective_ledger_unavailable');
  expect(demoConsistencyBudget([{ ...order(0), entry_minute: new Date(DEMO_CONSISTENCY_START - 60_000).toISOString() }], 'TREND', target).entries).toBe(0);
});
