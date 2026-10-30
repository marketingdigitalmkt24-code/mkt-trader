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

function candlesAt(rsiTarget: 'call' | 'put') {
  // Deep stretch: steady move then flat-ish closes keeps stretch high while RSI sits near the edge.
  const values: number[] = [];
  for (let i = 0; i < 60; i++) values.push(rsiTarget === 'call' ? 100 - i * 0.25 + (i % 2 ? 0.2 : -0.2) : 100 + i * 0.25 + (i % 2 ? 0.2 : -0.2));
  return series(values);
}

test('Dislocation with RSI 15–20 fires CALL again (restored rsi<20)', () => {
  const out = takashiKotegawa(candlesAt('call'), entry);
  expect(out?.direction).toBe('CALL');
  expect(out!.rsi >= 15 && out!.rsi < 20).toBe(true);
  expect(out!.stretch >= 5).toBe(true);
});

test('Rally with RSI 80–85 fires PUT again (restored rsi>80)', () => {
  const out = takashiKotegawa(candlesAt('put'), entry);
  expect(out?.direction).toBe('PUT');
  expect(out!.rsi > 80 && out!.rsi <= 85).toBe(true);
});

test('Stretch below 5x the average body stays out even with extreme RSI', () => {
  const values: number[] = [];
  for (let i = 0; i < 60; i++) values.push(100 - (i >= 55 ? (i - 54) * 0.05 : 0) + (i % 2 ? 0.3 : -0.3));
  expect(takashiKotegawa(series(values), entry)).toBeNull();
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
