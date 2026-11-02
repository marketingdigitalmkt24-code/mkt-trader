import { expect, test } from 'bun:test';
import { fibonacciRetracementConfirms } from './fibonacci-retracement.ts';

// Impulse from 100 to 110 over 30 candles, then the signal candle.
function upSwing(signal: { l: number; c: number }) {
  const cs = [];
  for (let j = 0; j < 30; j++) { const p = 100 + (j * 10) / 29; cs.push({ o: p, c: p, h: p, l: p }); }
  cs.push({ o: signal.c, c: signal.c, h: Math.max(signal.c, signal.l), l: signal.l });
  return cs;
}
const mirror = (cs: { o: number; c: number; h: number; l: number }[]) => cs.map(k => ({ o: 200 - k.o, c: 200 - k.c, h: 200 - k.l, l: 200 - k.h }));

test('CALL confirms when the pullback touches the 50% level and closes above 61.8%', () => {
  const out = fibonacciRetracementConfirms(upSwing({ l: 105, c: 106 }), 'CALL');
  expect(out?.ratio).toBeCloseTo(0.5, 5);
});

test('CALL rejects a shallow pullback above 38.2%', () => {
  expect(fibonacciRetracementConfirms(upSwing({ l: 107, c: 108 }), 'CALL')).toBeNull();
});

test('CALL rejects a deep pullback below 61.8%', () => {
  expect(fibonacciRetracementConfirms(upSwing({ l: 103, c: 106 }), 'CALL')).toBeNull();
});

test('PUT mirrors the CALL rule', () => {
  expect(fibonacciRetracementConfirms(mirror(upSwing({ l: 105, c: 106 })), 'PUT')?.ratio).toBeCloseTo(0.5, 5);
  expect(fibonacciRetracementConfirms(mirror(upSwing({ l: 107, c: 108 })), 'PUT')).toBeNull();
});

test('Direction against the impulse never confirms', () => {
  expect(fibonacciRetracementConfirms(upSwing({ l: 105, c: 106 }), 'PUT')).toBeNull();
});
