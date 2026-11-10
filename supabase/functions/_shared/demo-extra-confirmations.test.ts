import { expect, test } from 'bun:test';
import { demoExtraConfirmations } from './demo-extra-confirmations.ts';
const up = Array.from({ length: 80 }, (_, j) => { const o = 100 + j * .02; const c = o + (j % 2 ? -.09 : .12); return { o, c, h: Math.max(o, c) + .05, l: Math.min(o, c) - .05 }; });
test('rising trend with bullish last candle passes CALL and fails PUT', () => {
  const cs = [...up.slice(0, -1), { o: 101.58, c: 101.8, h: 101.85, l: 101.5 }];
  expect(demoExtraConfirmations(cs, 'PUT')).toBe('candle');
  expect(demoExtraConfirmations(cs, 'CALL')).not.toBe('candle');
});
test('flat last candle is rejected for lack of movement', () => {
  const cs = [...up.slice(0, -1), { o: 101.58, c: 101.59, h: 101.6, l: 101.58 }];
  expect(demoExtraConfirmations(cs, 'CALL')).toBe('movement');
});
