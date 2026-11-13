import { DEMO_ANALYSIS_SEC } from './demo-timing.ts';

type AnalysisCandle = { t: number; o: number; c: number; h: number; l: number };
const ANALYSIS_CANDLES = 90;
const RANGE_LOOKBACK = 20;
const BARS_PER_MINUTE = 60 / DEMO_ANALYSIS_SEC;

export function closedDemoAnalysisWindow<T extends AnalysisCandle>(candles: T[], entrySecond: number): T[] | null {
  // Use one fixed window for the detector, confirmations and ranking.
  const window = candles.filter(candle => candle.t < entrySecond).slice(-ANALYSIS_CANDLES);
  const complete = window.length === ANALYSIS_CANDLES && window.every((candle, index) =>
    candle.t === entrySecond - (window.length - index) * DEMO_ANALYSIS_SEC
    && [candle.o, candle.c, candle.h, candle.l].every(Number.isFinite)
    && candle.l > 0
    && candle.l <= Math.min(candle.o, candle.c)
    && candle.h >= Math.max(candle.o, candle.c)
  );
  return complete ? window : null;
}

export function demoEma(period: number, prices: number[]): number[] {
  const alpha = 2 / (period + 1);
  const values: number[] = [];
  for (const price of prices) {
    const previous = values[values.length - 1];
    values.push(previous === undefined ? price : price * alpha + previous * (1 - alpha));
  }
  return values;
}

const unit = (value: number) => Math.max(0, Math.min(1, value));

export function demoCandleContext(candles: AnalysisCandle[], direction: 'CALL' | 'PUT') {
  const last = candles[candles.length - 1];
  const prior = candles.slice(-RANGE_LOOKBACK - 1, -1);
  const typicalRange = prior.reduce((sum, candle) => sum + (candle.h - candle.l), 0) / RANGE_LOOKBACK;
  const range = last.h - last.l;
  const side = direction === 'CALL' ? 1 : -1;
  const minute = [...prior.slice(-BARS_PER_MINUTE), last];
  const minuteMove = side * (last.c - minute[0].c);
  const minuteTravel = minute.slice(1).reduce((sum, candle, i) => sum + Math.abs(candle.c - minute[i].c), 0);
  return {
    typicalRange,
    range,
    bodyShare: range > 0 ? side * (last.c - last.o) / range : 0,
    rangeMultiple: typicalRange > 0 ? range / typicalRange : null,
    minuteMove,
    minuteEfficiency: minuteTravel > 0 ? minuteMove / minuteTravel : 0,
  };
}

export function demoSignalQuality(
  candles: AnalysisCandle[],
  direction: 'CALL' | 'PUT',
  fastEma: number,
  slowEma: number,
  requiresPullback: boolean,
  candleContext = demoCandleContext(candles, direction),
): number {
  const last = candles[candles.length - 1];
  const { typicalRange, range, bodyShare, rangeMultiple } = candleContext;
  if (!Number.isFinite(typicalRange) || !(typicalRange > 0) || !(range > 0)) return 0;

  const side = direction === 'CALL' ? 1 : -1;
  const trend = unit(side * (fastEma - slowEma) / typicalRange);
  const wick = direction === 'CALL' ? last.l : last.h;
  const reference = requiresPullback ? wick : last.c;
  const entry = unit(1 - Math.abs(reference - slowEma) / (2 * typicalRange));
  const confirmation = unit(bodyShare);
  const spikePenalty = unit(1 - Math.max(0, (rangeMultiple ?? 0) - 2) / 3);
  // Relative ranking within the current strategy slot, with range normalization across assets.
  return Math.round(100 * (0.4 * trend + 0.3 * entry + 0.3 * confirmation) * spikePenalty);
}

export function selectDemoByQuality<T extends { signal_id: string; quality: number }>(candidates: T[]): T | null {
  return [...candidates].sort((a, b) => b.quality - a.quality || a.signal_id.localeCompare(b.signal_id))[0] ?? null;
}

type StudyCandidate = {
  signal_id: string;
  quality: number;
  candleContext: ReturnType<typeof demoCandleContext>;
  payout: number | null;
};

export function rankDemoPractice<T extends StudyCandidate, H extends {
  netReturn: number | null; weight: number; wins: number; losses: number;
}>(
  candidates: T[],
  readHistory: (candidate: T) => H,
) {
  return candidates.map(candidate => {
    const history = readHistory(candidate);
    // At equal quality, favor orderly movement and better terms. All adjustments are bounded.
    const momentum = 8 * Math.max(-1, Math.min(1, candidate.candleContext.minuteEfficiency));
    const payout = candidate.payout;
    const decisive = history.wins + history.losses;
    // With little evidence, shrink toward break-even at an 80% payout. This is a ranking prior, not a predicted win.
    const prior = 1 / 1.8;
    const historicalWinRate = decisive > 0 ? history.wins / decisive : prior;
    const estimatedWinRate = prior + history.weight * (historicalWinRate - prior);
    const breakEvenWinRate = payout === null ? null : 1 / (1 + payout);
    const expectedReturn = payout === null ? null : Math.round(((1 + payout) * estimatedWinRate - 1) * 1e6) / 1e6;
    const economics = expectedReturn === null ? -5 : Math.max(-12, Math.min(12, 40 * expectedReturn));
    const historical = 8 * history.weight * Math.max(-1, Math.min(1, (history.netReturn ?? 0) / 0.25));
    return {
      candidate, history, momentum, economics, historical, breakEvenWinRate, estimatedWinRate, expectedReturn,
      score: candidate.quality + momentum + economics + historical,
    };
  }).sort((a, b) => b.score - a.score || b.candidate.quality - a.candidate.quality
    || a.candidate.signal_id.localeCompare(b.candidate.signal_id));
}

export function selectDemoPracticeByReturn<T extends { score: number; expectedReturn: number | null }>(
  rank: readonly T[], inCooldown: boolean,
): T | undefined {
  const best = rank[0];
  const positive = rank.find(entry => entry.expectedReturn !== null && entry.expectedReturn > 0);
  if (inCooldown) return positive;
  // Prefer positive projected return among close technical choices. The estimate is noisy.
  if (best && positive && best.score - positive.score <= 8) return positive;
  return best;
}

export function selectDemoMostProfitable<T extends { score: number; expectedReturn: number | null }>(eligible: readonly T[]): T | undefined {
  return [...eligible].filter(entry => entry.expectedReturn !== null && Number.isFinite(entry.expectedReturn) && entry.expectedReturn > 0)
    .sort((a, b) => b.expectedReturn! - a.expectedReturn! || b.score - a.score)[0];
}

export function compareDemoFilters(candidates: StudyCandidate[]) {
  const tests: Record<string, (candidate: StudyCandidate) => boolean> = {
    quality_65: c => c.quality >= 65,
    candle_body_50: c => c.candleContext.bodyShare >= 0.5,
    range_at_most_2: c => c.candleContext.rangeMultiple !== null && c.candleContext.rangeMultiple <= 2,
    aligned_minute: c => c.candleContext.minuteMove > 0,
    payout_80: c => c.payout !== null && c.payout >= 0.8,
    quality_and_candle: c => c.quality >= 65 && c.candleContext.bodyShare >= 0.5
      && c.candleContext.rangeMultiple !== null && c.candleContext.rangeMultiple <= 2,
  };
  return Object.fromEntries(Object.entries(tests).map(([name, passes]) => {
    const eligible = candidates.filter(passes);
    const winner = selectDemoByQuality(eligible);
    return [name, { eligible: eligible.length, selected: winner?.signal_id ?? null }];
  }));
}
