import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchesTrendSequence } from './trend-sequence-test.ts';
const minute = Date.parse('2026-10-17T06:58:00-03:00');
const recent = [
  { entry_strategy: 'VELA_FORCA', result: 'loss', created_at: '2026-10-17T06:57:00-03:00' },
  { entry_strategy: 'TENDENCIA', result: 'loss', created_at: '2026-10-17T06:56:00-03:00' },
  { entry_strategy: 'TENDENCIA', result: 'win', created_at: '2026-10-17T06:55:00-03:00' },
];
test('06:55 Trend WIN, 06:56 Trend LOSS, 06:57 Force LOSS observes 06:58 Trend', () => {
  assert.equal(matchesTrendSequence(recent, 'TENDENCIA', minute), true);
});
test('next signal must be Trend', () => {
  for (const s of ['VELA_FORCA', 'REVERSAO_RSI']) assert.equal(matchesTrendSequence(recent, s, minute), false);
});
test('missing minute or delayed candidate never rolls forward', () => {
  assert.equal(matchesTrendSequence(recent, 'TENDENCIA', minute + 60000), false);
  assert.equal(matchesTrendSequence(recent.slice(0, 2), 'TENDENCIA', minute), false);
});
test('all three exact strategies and settled outcomes required', () => {
  recent.forEach((_, i) => {
    assert.equal(matchesTrendSequence(recent.map((r, j) => j === i ? { ...r, result: 'test7_open' } : r), 'TENDENCIA', minute), false);
    assert.equal(matchesTrendSequence(recent.map((r, j) => j === i ? { ...r, entry_strategy: 'KDJ' } : r), 'TENDENCIA', minute), false);
  });
});