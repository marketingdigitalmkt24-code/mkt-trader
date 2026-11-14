import { expect, test } from 'bun:test';
import { closedDemoAnalysisWindow, compareDemoFilters, demoCandleContext, demoSignalQuality, rankDemoPractice, rankDemoPracticeBaseline, selectDemoByQuality, selectDemoPracticeByReturn, selectDemoMostProfitable } from './demo-signal-quality.ts';
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

test('compares filters on eligible alternatives and records when a filter would skip the minute', () => {
  const weakBody = demoCandleContext(history, 'CALL');
  const strongBody = demoCandleContext([
    ...history.slice(0, -1),
    { ...history[89], o: 99.6, c: 100.4 },
  ], 'CALL');
  const candidates = [
    { signal_id: 'current', quality: 70, candleContext: weakBody, payout: null },
    { signal_id: 'alternative', quality: 60, candleContext: strongBody, payout: 0.8 },
  ];
  const comparison = compareDemoFilters(candidates);
  expect(comparison.quality_65).toEqual({ eligible: 1, selected: 'current' });
  expect(comparison.candle_body_50).toEqual({ eligible: 1, selected: 'alternative' });
  expect(comparison.payout_80).toEqual({ eligible: 1, selected: 'alternative' });
  expect(comparison.quality_and_candle).toEqual({ eligible: 0, selected: null });
  expect(selectDemoByQuality(candidates)?.signal_id).toBe('current');
});

test('prefers a steadier directional minute and better payout among comparable setups', () => {
  const candles = (steps: number[]) => [...history.slice(0, -steps.length), ...steps.map((c, i) => ({
    ...history[history.length - steps.length + i], c,
  }))];
  const steady = demoCandleContext(candles([100, 100.1, 100.2, 100.3, 100.4]), 'CALL');
  const choppy = demoCandleContext(candles([100, 100.5, 99.8, 100.5, 100.4]), 'CALL');
  const a = { signal_id: 'a', quality: 68, candleContext: choppy, payout: 0.65 };
  const b = { signal_id: 'b', quality: 66, candleContext: steady, payout: 0.85 };
  const ranks = rankDemoPractice([a, b], () => ({ netReturn: null, weight: 0, wins: 0, losses: 0 }));
  expect(ranks[0].candidate).toBe(b);
  expect(ranks[0].momentum).toBeGreaterThan(ranks[1].momentum);
  expect(ranks[0].economics).toBeGreaterThan(ranks[1].economics);
  expect(ranks[0].breakEvenWinRate!).toBeCloseTo(1 / 1.85, 8);
});

test('continues selecting a qualified setup with missing or negative history, while rewarding supported positive returns', () => {
  const base = { quality: 65, candleContext: demoCandleContext(history, 'CALL'), payout: 0.83 };
  const a = { ...base, signal_id: 'a' };
  const b = { ...base, signal_id: 'b' };
  expect(rankDemoPractice([a], () => ({ netReturn: null, weight: 0, wins: 0, losses: 0 }))[0].candidate).toBe(a);
  expect(rankDemoPractice([a], () => ({ netReturn: -0.4, weight: 0.8, wins: 16, losses: 24 }))[0].candidate).toBe(a);
  const ranks = rankDemoPractice([a, b], c => ({ netReturn: c === a ? -0.1 : 0.15, weight: 0.8, wins: c === a ? 19 : 25, losses: c === a ? 21 : 15 }));
  expect(ranks[0].candidate).toBe(b);
  expect(ranks[0].historical).toBeGreaterThan(0);
  expect(ranks[1].historical).toBeLessThan(0);
});

test('prefers nearby positive returns and allows a bounded pause when none qualify', () => {
  const best = { score: 76, expectedReturn: -0.04 };
  const close = { score: 70, expectedReturn: 0.05 };
  const distant = { score: 53, expectedReturn: 0.10 };
  expect(selectDemoPracticeByReturn([best, close, distant], false)).toBe(close);
  expect(selectDemoPracticeByReturn([best, distant], false)).toBe(best);
  expect(selectDemoPracticeByReturn([best, distant], true)).toBe(distant);
  expect(selectDemoPracticeByReturn([best], true)).toBe(undefined);
  expect(selectDemoPracticeByReturn([best], false)).toBe(best);
});

test('prioritizes the highest estimated net return only after candidates passed technical gates', () => {
  const strong = { score: 86, expectedReturn: 0.04 };
  const profitable = { score: 78, expectedReturn: 0.10 };
  expect(selectDemoMostProfitable([strong, profitable])).toBe(profitable);
  expect(selectDemoMostProfitable([{ score: 100, expectedReturn: -0.01 }])).toBe(undefined);
  expect(selectDemoMostProfitable([{ score: 100, expectedReturn: Number.NaN }, strong])).toBe(strong);
});

test('reduces the priority of stretched entries and opposing wicks without blocking the candidate', () => {
  const base = { quality: 68, payout: 0.83, candleContext: demoCandleContext(history, 'CALL') };
  const stretched = { ...base, signal_id: 'a', candleContext: {
    ...base.candleContext, extensionRanges: 5, opposingWickShare: 0.6, minuteAgreement: -1,
  } };
  const orderly = { ...base, signal_id: 'z', candleContext: {
    ...base.candleContext, extensionRanges: 0.5, opposingWickShare: 0.05, minuteAgreement: 1,
  } };
  const read = () => ({ netReturn: -0.1, weight: 0.5, wins: 19, losses: 21 });
  expect(rankDemoPracticeBaseline([stretched, orderly], read)[0].candidate).toBe(stretched);
  const ranks = rankDemoPractice([stretched, orderly], read);
  expect(ranks[0].candidate).toBe(orderly);
  expect(ranks.length).toBe(2);
  expect(rankDemoPractice([stretched], read)[0].candidate).toBe(stretched);
});

test('shrinks small asset samples and favors a supported asset among otherwise comparable choices', () => {
  const base = { quality: 65, payout: 0.85, candleContext: demoCandleContext(history, 'CALL') };
  const a = { ...base, signal_id: 'a' }, b = { ...base, signal_id: 'b' };
  const read = (c: typeof a) => ({
    wins: 50, losses: 50, weight: 0.7, netReturn: -0.05,
    assetWins: c === a ? 2 : 14, assetLosses: c === a ? 8 : 6, assetWeight: c === a ? 0.05 : 0.5,
  });
  const ranks = rankDemoPractice([a, b], read);
  expect(ranks[0].candidate).toBe(b);
  expect(ranks[0].estimatedWinRate).toBeGreaterThan(ranks[1].estimatedWinRate);
  expect(ranks[1].estimatedWinRate).toBeGreaterThan(0.45);
});

test('new candle context is symmetric for mirrored CALL and PUT patterns', () => {
  const mirror = history.map(c => ({ t: c.t, o: 200 - c.o, c: 200 - c.c, h: 200 - c.l, l: 200 - c.h }));
  const call = demoCandleContext(history, 'CALL');
  const put = demoCandleContext(mirror, 'PUT');
  expect(call.opposingWickShare).toBeCloseTo(put.opposingWickShare, 8);
  expect(call.extensionRanges).toBeCloseTo(put.extensionRanges, 8);
  expect(call.minuteAgreement).toBe(put.minuteAgreement);
});
