import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fiveTouches, resistanceStudy, type Candle } from './resistance-study.ts';
function fixture(touches = 5): Candle[] {
  const cs = Array.from({ length: 181 }, (_, i) => ({ t: i * 60, o: i <= 60 ? 95 : 93, c: i <= 60 ? 94 + i / 60 : 93, h: i <= 60 ? 100 : 94, l: 90 }));
  for (let n = 0; n < touches; n++) cs[180 - n * 20].h = 100;
  return cs;
}
test('five separate resistance touches authorize PUT, four do not', () => {
  assert.equal(fiveTouches(fixture(5), 180), true);
  assert.equal(fiveTouches(fixture(4), 180), false);
});
test('adjacent bars at resistance are one touch and a breakout invalidates it', () => {
  const adjacent = fixture(1);
  for (let i = 176; i <= 180; i++) adjacent[i].h = 100;
  assert.equal(fiveTouches(adjacent, 180), false);
  const broken = fixture(); broken[170].c = 110;
  assert.equal(fiveTouches(broken, 180), false);
});
test('PUT is measured at next minute open/close without future candles in detection', () => {
  const cs = fixture(); cs.push({ t: 181 * 60, o: 100, c: 99, h: 101, l: 98 });
  const s = resistanceStudy(cs, 182 * 60);
  assert.equal(s.validation.wins, 1);
  cs[181].c = 101;
  assert.equal(resistanceStudy(cs, 182 * 60).validation.losses, 1);
});