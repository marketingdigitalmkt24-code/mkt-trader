import { demoChartComparison, type DemoChartCandle } from './demo-chart-comparison';

const released = [2.26,2.23,2.18,2.64,2.88,2.03,2.69,2.91,2.04,2.61,2.78,2.37,2.76,2.20];
export function readLossCandles(value: unknown): DemoChartCandle[] {
  if (!Array.isArray(value)) return [];
  return value.filter((c): c is DemoChartCandle => c != null && typeof c === 'object'
    && ['t','o','c','h','l'].every(k => typeof c[k] === 'number' && Number.isFinite(c[k])))
    .sort((a,b)=>a.t-b.t);
}
export function lossReview(candles: DemoChartCandle[], entry: number, direction: string, score: number | null, now = Date.now()/1000) {
  const closed = candles.filter(c=>c.t+60<=now);
  const before = closed.filter(c=>c.t<entry).slice(-6);
  const comparison = demoChartComparison(closed,entry,direction,now);
  const previous = before[before.length-1];
  let streak = 0;
  if (previous) {
    const sign = Math.sign(previous.c-previous.o);
    if (sign) for (let i=before.length-1;i>=0 && Math.sign(before[i].c-before[i].o)===sign;i--) streak++;
  }
  return {
    before, comparison, previous, streak,
    previousBody: previous && previous.h>previous.l ? Math.abs(previous.c-previous.o)/(previous.h-previous.l)*100 : null,
    roundedOnly: score!==null && Number.isFinite(score) && !released.includes(score) && released.some(v=>Math.round(score*100)===Math.round(v*100)),
    requiredScore: score!==null && Number.isFinite(score) ? Math.round(score*100)/100 : null,
  };
}