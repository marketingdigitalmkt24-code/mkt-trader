import { DEMO_ANALYSIS_SEC } from './demo-timing.ts';

type AnalysisCandle = { t: number; o: number; c: number; h: number; l: number };
const ANALYSIS_CANDLES = 90;

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

export function demoSignalQuality(
  candles: AnalysisCandle[],
  direction: 'CALL' | 'PUT',
  fastEma: number,
  slowEma: number,
  requiresPullback: boolean,
): number {
  const last = candles[candles.length - 1];
  const typicalRange = candles.slice(-21, -1).reduce((sum, candle) => sum + (candle.h - candle.l), 0) / 20;
  const range = last.h - last.l;
  if (!Number.isFinite(typicalRange) || !(typicalRange > 0) || !(range > 0)) return 0;

  const side = direction === 'CALL' ? 1 : -1;
  const trend = unit(side * (fastEma - slowEma) / typicalRange);
  const wick = direction === 'CALL' ? last.l : last.h;
  const reference = requiresPullback ? wick : last.c;
  const entry = unit(1 - Math.abs(reference - slowEma) / (2 * typicalRange));
  const confirmation = unit(side * (last.c - last.o) / range);
  const spikePenalty = unit(1 - Math.max(0, range / typicalRange - 2) / 3);
  // Relative ranking within the current strategy slot, with range normalization across assets.
  return Math.round(100 * (0.4 * trend + 0.3 * entry + 0.3 * confirmation) * spikePenalty);
}

export function selectDemoByQuality<T extends { signal_id: string; quality: number }>(candidates: T[]): T | null {
  return [...candidates].sort((a, b) => b.quality - a.quality || a.signal_id.localeCompare(b.signal_id))[0] ?? null;
}
