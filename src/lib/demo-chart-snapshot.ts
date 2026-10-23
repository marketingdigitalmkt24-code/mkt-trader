import type { DemoChartCandle } from './demo-chart-comparison';

// Presentation snapshots only: entry and its following candle must be closed.
export function extendDemoChart(saved: DemoChartCandle[], observed: DemoChartCandle[], entry: number, now: number) {
  const candles = new Map(saved.filter(k => k.t < entry || k.t + 60 <= now).map(k => [k.t, k]));
  for (const candle of observed) {
    if ((candle.t === entry || candle.t === entry + 60) && candle.t + 60 <= now) candles.set(candle.t, candle);
  }
  return [...candles.values()].sort((a, b) => a.t - b.t);
}