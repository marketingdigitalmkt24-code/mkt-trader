import { test } from 'node:test';
import assert from 'node:assert/strict';
import { marketBias, exactAssetKey, type Candle } from './bias.ts';
const series = (sign = 1): Candle[] => Array.from({ length: 100 }, (_, i) => ({ t: i * 900, o: 200 + i * sign, c: 200 + (i + 1) * sign, h: 302, l: 99 }));
test('only M15 closed before entry is used even inside the next M15', () => {
  const cs = series();
  cs.push({ t: 90000, o: 300, c: -10000, h: 300, l: -10000 });
  assert.deepEqual(marketBias(cs, 90120), { bias: 'CALL', lastClosed: 90000 });
  assert.deepEqual(marketBias(cs, 90000), { bias: 'CALL', lastClosed: 90000 });
});
test('a missing M15 bar cannot be bridged', () => {
  const cs = series(); cs.splice(50, 1);
  assert.equal(marketBias(cs, 90000).bias, 'MISSING');
});
test('100 closed candles are required for warmup', () => {
  assert.equal(marketBias(series().slice(1), 90000).bias, 'MISSING');
});
test('fixed rule distinguishes bearish and neutral without results', () => {
  assert.equal(marketBias(series(-1), 90000).bias, 'PUT');
  assert.equal(marketBias(series(0), 90000).bias, 'NEUTRAL');
});
test('OTC is never mapped to regular', () => {
  assert.notEqual(exactAssetKey('EUR/USD-OTC'), exactAssetKey('EUR/USD'));
  assert.equal(exactAssetKey('front.EURUSD-OTC'), exactAssetKey('EUR/USD-OTC'));
});