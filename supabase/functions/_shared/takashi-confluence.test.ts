import { expect, test } from 'bun:test';
import { takashiConfluence } from './takashi-confluence.ts';

const entry = 1_700_000_000 - (1_700_000_000 % 60);

// Panic drop (arms Takashi CALL), then a rebound with a pullback and a final breakout candle.
function closes(rebound = [1.5, 1.5, 1.5, 1.5, 1.5, 1.5, -0.8, -0.8, 1.5, 1.5, 1.5, 2.5]) {
  const vals: number[] = [];
  for (let i = 0; i < 62; i++) vals.push(100 - i * 0.5);
  let p = vals[vals.length - 1];
  for (const s of rebound) { p += s; vals.push(p); }
  return vals;
}
function candles(vals: number[], lastVolume = 300) {
  return vals.map((c, i) => {
    const o = i === 0 ? c : vals[i - 1];
    return { t: entry - (vals.length - i) * 60, o, c, h: Math.max(o, c) + 0.1, l: Math.min(o, c) - 0.1, v: i === vals.length - 1 ? lastVolume : 100 };
  });
}

test('All five confirmations aligned fire CALL', () => {
  const out = takashiConfluence(candles(closes()), entry);
  expect(out?.direction).toBe('CALL');
  expect(out!.volumeRatio).toBe(3);
  expect(out!.ema9 > out!.ema21).toBe(true);
});

test('Mirrored setup fires PUT', () => {
  const out = takashiConfluence(candles(closes().map(v => 200 - v)), entry);
  expect(out?.direction).toBe('PUT');
});

test('Without a volume increase there is no entry', () => {
  expect(takashiConfluence(candles(closes(), 100), entry)).toBeNull();
});

test('Volume ratio just below 1.2x blocks; 1.2x passes', () => {
  expect(takashiConfluence(candles(closes(), 119), entry)).toBeNull();
  expect(takashiConfluence(candles(closes(), 120), entry)?.direction).toBe('CALL');
});

test('Takashi signal alone (price still below VWAP and averages) does not fire', () => {
  expect(takashiConfluence(candles(closes([0.3, 0.3])), entry)).toBeNull();
});

test('Without any Takashi signal in the window nothing fires', () => {
  const vals = Array.from({ length: 80 }, (_, i) => 100 + Math.sin(i) * 0.2);
  expect(takashiConfluence(candles(vals), entry)).toBeNull();
});

test('Entry minute must be aligned to :00', () => {
  expect(takashiConfluence(candles(closes()), entry + 30)).toBeNull();
});
