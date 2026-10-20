import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateMidCandle } from './midcandle.ts';
import type { Candle } from './bias.ts';
const halves = (n: number): Candle[] => Array.from({ length: n }, (_, i) => ({ t: i * 30, o: 100, c: 100 + (i % 2 ? 0.1 : -0.1), h: 100.5, l: 99.5 }));
test('strong first half enters with it and wins at 85% when price keeps going', () => {
  const cs = halves(40); const m = 900, i = m / 30;
  cs[i] = { t: m, o: 100, c: 101, h: 101, l: 100 }; cs[i + 2] = { t: m + 60, o: 101, c: 102, h: 102, l: 101 };
  const r = evaluateMidCandle(cs, m, m + 60, m + 60, new Map());
  assert.equal(r.discovery.all.wins, 1); assert.equal(r.discovery.all.profit, 8.5);
});
test('weak first half below 0.5 ATR does not enter', () => {
  const cs = halves(40); const m = 900;
  assert.equal(evaluateMidCandle(cs, m, m + 60, m + 60, new Map()).discovery.all.signals, 0);
});
test('a gap in the previous 15 minutes disables the minute', () => {
  const cs = halves(40).filter(k => k.t !== 600);
  assert.equal(evaluateMidCandle(cs, 900, 960, 960, new Map()).analyzedMinutes, 0);
});
