export type ResultCandle = { t: number; o: number; c: number };

export function closedTestResult(candles: ResultCandle[], entrySec: number, direction: string, nowSec: number) {
  const candle = candles.find(k => k.t === entrySec && k.t + 60 <= nowSec);
  if (!candle || !Number.isFinite(candle.o) || !Number.isFinite(candle.c)) return null;
  const result = candle.c === candle.o ? 'tie' : (candle.c > candle.o) === (direction === 'CALL') ? 'win' : 'loss';
  return { result, profit: result === 'win' ? 8.5 : result === 'loss' ? -10 : 0, entry_price: candle.o, exit_price: candle.c };
}

export function prioritizeResultAssets<T>(assets: Map<string, T>, expiredAssets: string[]): [string, T][] {
  const priority = new Set(expiredAssets);
  return [...assets].sort(([a], [b]) => Number(priority.has(b)) - Number(priority.has(a)));
}