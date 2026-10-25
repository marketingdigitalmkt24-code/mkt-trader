import { assertEquals } from 'jsr:@std/assert@1';
import { takashiKotegawa, TAKASHI_BNF } from './takashi-kotegawa.ts';

const entry = 1_700_000_000 - (1_700_000_000 % 60);

function series(values: number[]): { t: number; o: number; c: number; h: number; l: number }[] {
  return values.map((c, i) => {
    const o = i === 0 ? c : values[i - 1];
    return { t: entry - (values.length - i) * 60, o, c, h: Math.max(o, c) + 0.1, l: Math.min(o, c) - 0.1 };
  });
}

Deno.test('Takashi Kotegawa labels constant', () => {
  assertEquals(TAKASHI_BNF, 'TAKASHI_BNF_V1');
});

Deno.test('Panic drop far below SMA25 with oversold RSI fires CALL', () => {
  const values: number[] = [];
  for (let i = 0; i < 60; i++) values.push(100 - i * 0.5); // closes 100 → 70.5
  const out = takashiKotegawa(series(values), entry);
  assertEquals(out?.direction, 'CALL');
  assertEquals(out!.rsi < 20, true);
});

Deno.test('Panic rally far above SMA25 with overbought RSI fires PUT', () => {
  const values: number[] = [];
  for (let i = 0; i < 60; i++) values.push(100 + i * 0.5);
  const out = takashiKotegawa(series(values), entry);
  assertEquals(out?.direction, 'PUT');
  assertEquals(out!.rsi > 80, true);
});

Deno.test('Sideways market near the mean stays out', () => {
  const values: number[] = [];
  for (let i = 0; i < 60; i++) values.push(100 + Math.sin(i) * 0.2);
  assertEquals(takashiKotegawa(series(values), entry), null);
});

Deno.test('Entry minute must be aligned to :00', () => {
  const values: number[] = [];
  for (let i = 0; i < 60; i++) values.push(100 - i * 0.5);
  assertEquals(takashiKotegawa(series(values), entry + 30), null);
});
