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
  return {
    typicalRange,
    range,
    bodyShare: range > 0 ? side * (last.c - last.o) / range : 0,
    rangeMultiple: typicalRange > 0 ? range / typicalRange : null,
    minuteMove: side * (last.c - prior[prior.length - BARS_PER_MINUTE].c),
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
