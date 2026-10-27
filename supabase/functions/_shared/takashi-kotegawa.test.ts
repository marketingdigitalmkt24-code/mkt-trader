import { expect, test } from 'bun:test';
const assertEquals = (actual: unknown, expected: unknown) => expect(actual).toEqual(expected);
import { takashiKotegawa, TAKASHI_BNF } from './takashi-kotegawa.ts';

const entry = 1_700_000_000 - (1_700_000_000 % 60);

function series(values: number[]): { t: number; o: number; c: number; h: number; l: number }[] {
  return values.map((c, i) => {
    const o = i === 0 ? c : values[i - 1];
    return { t: entry - (values.length - i) * 60, o, c, h: Math.max(o, c) + 0.1, l: Math.min(o, c) - 0.1 };
  });
}

test('Takashi Kotegawa labels constant', () => {
  assertEquals(TAKASHI_BNF, 'TAKASHI_BNF_V1');
});

test('Panic drop far below SMA25 with oversold RSI fires CALL', () => {
  const values: number[] = [];
  for (let i = 0; i < 60; i++) values.push(100 - i * 0.5); // closes 100 → 70.5
  const out = takashiKotegawa(series(values), entry);
  assertEquals(out?.direction, 'CALL');
  assertEquals(out ? out.rsi < 20 : false, true);
});

test('Panic rally far above SMA25 with overbought RSI fires PUT', () => {
  const values: number[] = [];
  for (let i = 0; i < 60; i++) values.push(100 + i * 0.5);
  const out = takashiKotegawa(series(values), entry);
  assertEquals(out?.direction, 'PUT');
  assertEquals(out ? out.rsi > 80 : false, true);
});

test('Sideways market near the mean stays out', () => {
  const values: number[] = [];
  for (let i = 0; i < 60; i++) values.push(100 + Math.sin(i) * 0.2);
  assertEquals(takashiKotegawa(series(values), entry), null);
});

test('Entry minute must be aligned to :00', () => {
  const values: number[] = [];
  for (let i = 0; i < 60; i++) values.push(100 - i * 0.5);
  assertEquals(takashiKotegawa(series(values), entry + 30), null);
});
