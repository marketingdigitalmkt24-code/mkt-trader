import { expect, test } from 'bun:test';
import { closedDemoAnalysisWindow, demoSignalQuality, selectDemoByQuality } from './demo-signal-quality.ts';
import { DEMO_ANALYSIS_SEC } from './demo-timing.ts';

const entry = 600;
const history = Array.from({ length: 90 }, (_, index) => ({
  t: entry - (90 - index) * DEMO_ANALYSIS_SEC,
  o: 100, c: 100.1, h: 100.5, l: 99.5,
}));

test('uses the last 90 complete pre-entry candles and ignores the open candle', () => {
  const open = { ...history[89], t: entry, c: 10000 };
  expect(closedDemoAnalysisWindow([...history, open], entry)).toEqual(history);
});

test('rejects gaps, stale candles, duplicates and invalid prices', () => {
  const gap = history.map((candle, index) => index < 5 ? { ...candle, t: candle.t - DEMO_ANALYSIS_SEC } : candle);
  const stale = history.map(candle => ({ ...candle, t: candle.t - DEMO_ANALYSIS_SEC }));
  const duplicate = [...history.slice(0, 89), history[88]];
  const invalid = [...history.slice(0, 89), { ...history[89], h: 99 }];
  for (const candles of [gap, stale, duplicate, invalid, history.slice(1)]) {
    expect(closedDemoAnalysisWindow(candles, entry)).toBeNull();
  }
});

test('a better confirmation wins even when its ID sorts later', () => {
  const strong = [...history.slice(0, 89), { ...history[89], o: 99.7, c: 100.4 }];
  const a = { signal_id: 'a', quality: demoSignalQuality(history, 'CALL', 100.5, 100, false) };
  const z = { signal_id: 'z', quality: demoSignalQuality(strong, 'CALL', 100.5, 100, false) };
  expect(selectDemoByQuality([a, z])).toBe(z);
  expect(selectDemoByQuality([z, a])).toBe(z);
  expect(selectDemoByQuality([{ ...z, quality: a.quality }, a])).toBe(a);
  expect(selectDemoByQuality([])).toBeNull();
});

test('uses directional confirmation and penalizes a spike or an extended pullback', () => {
  const strong = [...history.slice(0, 89), { ...history[89], o: 99.7, c: 100.4 }];
  const spike = [...strong.slice(0, 89), { ...strong[89], h: 104.5 }];
  const near = demoSignalQuality(strong, 'CALL', 100.5, 100, true);
  expect(near).toBeGreaterThan(demoSignalQuality(spike, 'CALL', 100.5, 100, true));
  expect(near).toBeGreaterThan(demoSignalQuality(strong, 'CALL', 102, 101.5, true));
  const mirrored = strong.map(c => ({ t: c.t, o: 200 - c.o, c: 200 - c.c, h: 200 - c.l, l: 200 - c.h }));
  expect(demoSignalQuality(mirrored, 'PUT', 99.5, 100, true)).toBe(near);
});
