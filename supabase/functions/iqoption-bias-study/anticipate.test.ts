import { test } from 'node:test';
import assert from 'node:assert/strict';
import { anticipate, evaluateAnticipation } from './anticipate.ts';
import type { Candle } from './bias.ts';
// Flat noisy range, then a tight rising squeeze near the box top.
const series = (n = 100, t0 = 0): Candle[] => Array.from({ length: n }, (_, i) => {
  const c = i < 80 ? 100 + (i % 2 ? 1 : -1) : 100.4 + (i - 80) * 0.02 + (i % 2 ? 0.01 : -0.01);
  return { t: t0 + i * 60, o: c - 0.005, c, h: Math.max(c, 100.9), l: c - 0.02 };
});
test('gap in the 100 closed candles yields no prediction', () => {
  const cs = series(); cs.splice(40, 1); cs.push({ ...cs[98], t: 6000 });
  assert.equal(anticipate(cs).coverage, 'MISSING');
});
test('squeeze with rising averages near range top predicts CALL', () => {
  const p = anticipate(series());
  assert.equal(p.squeeze, true); assert.equal(p.signal, 'CALL');
});
test('predicted candle extreme values cannot change the prediction', () => {
  const cs = series(101); const before = evaluateAnticipation(cs, 6000, 6060, 6060, true, new Map([[6000, 'CALL']]));
  cs[100] = { t: 6000, o: 100, c: 1, h: 100, l: 1 };
  const after = evaluateAnticipation(cs, 6000, 6060, 6060, true, new Map([[6000, 'CALL']]));
  assert.equal(after.discovery.forceAnticipated, before.discovery.forceAnticipated);
  assert.equal(after.discovery.signals, 1); assert.equal(after.discovery.losses, 1);
});
