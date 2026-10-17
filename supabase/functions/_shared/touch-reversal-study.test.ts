import { test } from 'node:test';
import assert from 'node:assert/strict';
import { touchReversalStudy } from './touch-reversal-study.ts';
import type { Candle } from './resistance-study.ts';
function fixture(): Candle[] {
  const cs = Array.from({ length: 60 }, (_, i) => ({ t: i * 60, o: 90 + i / 10, c: 90 + i / 10, h: 100, l: 89 }));
  cs.push({ t: 3600, o: 98, c: 97, h: 100, l: 96 }, { t: 3660, o: 97, c: 96, h: 98, l: 95 });
  return cs;
}
test('resistance rejection measures PUT at the next minute, not the rejecting candle', () => {
  const cs = fixture();
  assert.equal(touchReversalStudy(cs, 3720).resistanceRejection.validation.wins, 1);
  cs[61].c = 98;
  assert.equal(touchReversalStudy(cs, 3720).resistanceRejection.validation.losses, 1);
});
test('support mirrors resistance and measures CALL', () => {
  const cs = fixture().map(k => ({ t: k.t, o: -k.o, c: -k.c, h: -k.l, l: -k.h }));
  assert.equal(touchReversalStudy(cs, 3720).supportRejection.validation.wins, 1);
});
test('touch alone differs from confirmation and missing minutes are excluded', () => {
  const cs = fixture(); cs[60].c = 99;
  const r = touchReversalStudy(cs, 3720);
  assert.equal(r.resistanceTouch.validation.wins, 1);
  assert.equal(r.resistanceRejection.validation.wins, 0);
  cs[30].t += 1;
  assert.equal(touchReversalStudy(cs, 3720).resistanceTouch.validation.wins, 0);
});