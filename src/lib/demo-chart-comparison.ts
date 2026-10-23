export type DemoChartCandle = { t: number; o: number; c: number; h: number; l: number };

export function demoChartComparison(candles: DemoChartCandle[], entry: number, direction: string, now = Date.now() / 1000) {
  const candle = candles.find(k => k.t === entry);
  if (!candle || now < entry + 60 || ![candle.o, candle.c].every(Number.isFinite)) return null;
  const movement = candle.c > candle.o ? 'up' : candle.c < candle.o ? 'down' : 'flat';
  const agrees = movement === 'flat' ? null : direction === 'CALL' ? movement === 'up' : direction === 'PUT' ? movement === 'down' : null;
  return { candle, movement, agrees };
}