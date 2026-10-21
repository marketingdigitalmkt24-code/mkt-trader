import type { Candle } from './bias.ts';
import { previousCandles } from './previous-candles.ts';
// Descriptive research only, never live trading thresholds.
export function forcePattern(candles: Candle[], entry: number, direction: string) {
  const previous = previousCandles(candles, entry, direction);
  if (previous.coverage !== 'OK') return previous;
  const byTime = new Map(candles.map(k => [k.t, k]));
  const last = Math.floor(entry / 60) * 60 - 60;
  const k = byTime.get(last);
  if (!k) return { coverage: 'MISSING' };
  const before: Candle[] = [];
  for (let i = 20; i >= 1; i--) {
    const c = byTime.get(last - i * 60);
    if (!c) return { coverage: 'MISSING' };
    before.push(c);
  }
  const avgBody = before.reduce((sum, c) => sum + Math.abs(c.c - c.o), 0) / 20;
  const range = k.h - k.l, body = Math.abs(k.c - k.o);
  const sign = direction === 'CALL' ? 1 : -1;
  return { ...previous, forceBodyRatio: avgBody > 0 ? body / avgBody : null,
    bodyShare: body / range, upperWick: (k.h - Math.max(k.o, k.c)) / range,
    lowerWick: (Math.min(k.o, k.c) - k.l) / range,
    matchesForce: avgBody > 0 && body > 2 * avgBody && sign * (k.c - k.o) > 0,
    breakout20: sign === 1 ? k.c > Math.max(...before.map(c => c.h)) : k.c < Math.min(...before.map(c => c.l)),
    precedingSameDirection: sign * (before[19].c - before[19].o) > 0,
    lastCandle: k, priorCandles: before };
}