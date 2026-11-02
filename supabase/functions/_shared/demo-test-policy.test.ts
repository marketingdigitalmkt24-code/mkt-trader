import { expect, test } from 'bun:test';
import { freshDemoCandidate } from './demo-test-policy';

const at = Date.parse('2026-11-02T00:20:00Z');
const row = (signal_id: string, entry_strategy: string) =>
  ({ signal_id, timeframe: 'TEST', created_at: '2026-11-02T00:20:00Z', direction: 'CALL', entry_strategy });

test('only the combined Ichimoku + Recuo 21 candidate is accepted, separate ones are retired', () => {
  expect(freshDemoCandidate(row('demo-ichimoku-recuo21-v1-EURUSD-OTC-1', 'ICHIMOKU_RECUO21'), at + 1000)).toBe(true);
  expect(freshDemoCandidate(row('demo-ichimoku-v1-EURUSD-OTC-1', 'ICHIMOKU'), at + 1000)).toBe(false);
});

test('mismatched prefix/strategy or stale candidates are refused', () => {
  expect(freshDemoCandidate(row('demo-ichimoku-recuo21-v1-EURUSD-OTC-1', 'RECUO_EMA21'), at + 1000)).toBe(false);
  expect(freshDemoCandidate(row('demo-ichimoku-recuo21-v1-EURUSD-OTC-1', 'ICHIMOKU_RECUO21'), at + 26000)).toBe(false);
});
