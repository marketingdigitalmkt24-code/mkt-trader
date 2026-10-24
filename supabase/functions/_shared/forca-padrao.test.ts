import { expect, test } from 'bun:test';
import { demoForcaPadrao, FORCA_PADRAO } from './forca-padrao';

const ENTRY = 1792816140; // US30/JP225-OTC 24/10 01:29 BRT (04:29 UTC) CALL WIN reference minute
const flat = (t: number) => ({ t, o: 100, c: 100.01, h: 100.02, l: 99.99 });
function series(tail: { o: number; c: number; h: number; l: number }[]) {
  const cs = Array.from({ length: 100 - tail.length }, (_, i) => flat(ENTRY - (100 - i) * 60));
  tail.forEach((k, i) => cs.push({ t: ENTRY - (tail.length - i) * 60, ...k }));
  return cs;
}
// Mirrors the reference win: rising closes, then a 65%-body green, then a near full-body
// green closing at its high.
const WIN_TAIL = [
  { o: 100.00, c: 100.10, h: 100.15, l: 99.95 },
  { o: 100.10, c: 100.20, h: 100.25, l: 100.05 },
  { o: 100.20, c: 100.30, h: 100.35, l: 100.15 },
  { o: 100.30, c: 100.43, h: 100.50, l: 100.28 }, // prev: body 13/22 ≈ 59%
  { o: 100.43, c: 100.70, h: 100.70, l: 100.41 }, // last: body 27/29 ≈ 93%, closes at high
];

test('reference pattern authorizes a CALL', () => {
  const r = demoForcaPadrao(series(WIN_TAIL), ENTRY);
  expect(r?.direction).toBe('CALL');
  expect(r!.bodyRatio).toBeGreaterThan(0.9);
});

test('mirrored red pattern authorizes a PUT', () => {
  const tail = WIN_TAIL.map(k => ({ o: 200 - k.o + 100, c: 200 - k.c + 100, h: 200 - k.l + 100, l: 200 - k.h + 100 }))
    .map(k => ({ o: k.o, c: k.c, h: k.h, l: k.l }));
  expect(demoForcaPadrao(series(tail), ENTRY)?.direction).toBe('PUT');
});

test('weak last candle body is rejected', () => {
  const tail = [...WIN_TAIL.slice(0, 4), { o: 100.43, c: 100.60, h: 100.75, l: 100.41 }];
  expect(demoForcaPadrao(series(tail), ENTRY)).toBeNull();
});

test('last candle closing away from the high is rejected', () => {
  const tail = [...WIN_TAIL.slice(0, 4), { o: 100.43, c: 100.66, h: 100.72, l: 100.41 }];
  expect(demoForcaPadrao(series(tail), ENTRY)).toBeNull();
});

test('opposite-color previous candle is rejected', () => {
  const tail = [...WIN_TAIL.slice(0, 3), { o: 100.43, c: 100.30, h: 100.50, l: 100.28 }, WIN_TAIL[4]];
  expect(demoForcaPadrao(series(tail), ENTRY)).toBeNull();
});

test('falling closes before the pattern are rejected', () => {
  const tail = [
    { o: 100.40, c: 100.30, h: 100.45, l: 100.25 },
    { o: 100.30, c: 100.20, h: 100.35, l: 100.15 },
    { o: 100.20, c: 100.10, h: 100.25, l: 100.05 },
    WIN_TAIL[3], WIN_TAIL[4],
  ];
  expect(demoForcaPadrao(series(tail), ENTRY)).toBeNull();
});

test('misaligned entry minute is rejected', () => {
  expect(demoForcaPadrao(series(WIN_TAIL), ENTRY + 30)).toBeNull();
});

test('strategy id stays versioned', () => {
  expect(FORCA_PADRAO).toBe('FORCA_PADRAO_V1');
});
