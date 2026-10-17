import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hasThreeForce } from './three-force.ts';
import { forceEntryDirection, isNextMinuteStrategy } from './force-loss-win.ts';
const candidate = Date.parse('2026-10-17T03:58:00-03:00');
const signals = [1, 2, 3].map(i => ({ strategy: 'VELA_FORCA', result: 'loss', minuteMs: candidate - i * 60000 }));
test('03:55–57 three force losses authorize 03:58 only', () => {
  assert.equal(hasThreeForce(signals, candidate), true);
  assert.equal(hasThreeForce(signals, candidate + 60000), false);
});
test('force signals authorize regardless of outcomes', () => {
  for (const result of ['win', 'loss', 'tie', 'test7_open']) {
    assert.equal(hasThreeForce(signals.map(row => ({ ...row, result })), candidate), true);
  }
});
test('requires three consecutive force signals', () => {
  assert.equal(hasThreeForce(signals.slice(0, 2), candidate), false);
  assert.equal(hasThreeForce([signals[0], { ...signals[1], strategy: 'TENDENCIA' }, signals[2]], candidate), false);
  assert.equal(hasThreeForce([signals[0], signals[1], { ...signals[2], minuteMs: candidate - 240000 }], candidate), false);
});
test('same direction and next-minute placement rules apply', () => {
  assert.equal(forceEntryDirection('PUT'), 'PUT');
  assert.equal(forceEntryDirection('CALL'), 'CALL');
  assert.equal(isNextMinuteStrategy('THREE_FORCE'), true);
});