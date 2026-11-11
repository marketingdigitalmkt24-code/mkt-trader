import { expect, test } from 'bun:test';
import { detectQuedaForte } from './demo-queda';
import { freshDemoCandidate } from './demo-test-policy';
const flat = Array.from({ length: 20 }, (_, i) => ({ o: 1, c: i % 2 ? 1.001 : 0.999 }));
test('strong drop follows with PUT, strong rise with CALL', () => {
  expect(detectQuedaForte([...flat, { o: 1, c: 0.999 }, { o: 0.999, c: 0.998 }, { o: 0.998, c: 0.995 }])).toBe('PUT');
  expect(detectQuedaForte([...flat, { o: 1, c: 1.001 }, { o: 1.001, c: 1.002 }, { o: 1.002, c: 1.005 }])).toBe('CALL');
});
test('weak or mixed moves do not fire', () => {
  expect(detectQuedaForte([...flat, { o: 1, c: 0.999 }, { o: 0.999, c: 0.998 }, { o: 0.998, c: 0.9975 }])).toBeNull();
  expect(detectQuedaForte([...flat, { o: 1, c: 1.001 }, { o: 1.001, c: 0.998 }, { o: 0.998, c: 0.995 }])).toBeNull();
});
test('Queda forte candidates are executable on M5 boundaries', () => {
  const at = Date.parse('2026-11-11T15:00:00Z');
  const row = { signal_id: 'demo-queda-forte-v1-EURUSD-1', timeframe: 'TEST', created_at: new Date(at).toISOString(), direction: 'PUT', entry_strategy: 'QUEDA_FORTE' };
  expect(freshDemoCandidate(row, at + 1000)).toBe(true);
  expect(freshDemoCandidate({ ...row, entry_strategy: 'ICHIMOKU' }, at + 1000)).toBe(false);
});
