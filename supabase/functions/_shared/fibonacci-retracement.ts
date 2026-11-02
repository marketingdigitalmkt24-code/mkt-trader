// Fibonacci retracement confluence for "Recuo na média 21" (Demo only).
// Uses the last impulse swing in the closed candles BEFORE the signal candle (no leakage):
// CALL → swing low followed by swing high; the signal candle's low must touch the
// 38.2%–61.8% retracement zone and close above the 61.8% level.
// PUT mirrors it. Returns the touched retracement ratio, or null when there is no confluence.
export type FibCandle = { o: number; c: number; h: number; l: number };

export const FIB_LOOKBACK = 30;
export const FIB_ZONE_MIN = 0.382;
export const FIB_ZONE_MAX = 0.618;

export function fibonacciRetracementConfirms(cs: FibCandle[], direction: 'CALL' | 'PUT', lookback = FIB_LOOKBACK): { ratio: number } | null {
  const i = cs.length - 1;
  if (i < lookback) return null;
  const win = cs.slice(i - lookback, i);
  const k = cs[i];
  if (direction === 'CALL') {
    let hiIdx = 0; for (let j = 1; j < win.length; j++) if (win[j].h >= win[hiIdx].h) hiIdx = j;
    let loIdx = 0; for (let j = 1; j <= hiIdx; j++) if (win[j].l <= win[loIdx].l) loIdx = j;
    if (loIdx >= hiIdx) return null;
    const hi = win[hiIdx].h, lo = win[loIdx].l, range = hi - lo;
    if (!(range > 0)) return null;
    const top = hi - FIB_ZONE_MIN * range, bottom = hi - FIB_ZONE_MAX * range;
    if (k.l > top || k.l < bottom || k.c <= bottom) return null;
    return { ratio: (hi - k.l) / range };
  }
  let loIdx = 0; for (let j = 1; j < win.length; j++) if (win[j].l <= win[loIdx].l) loIdx = j;
  let hiIdx = 0; for (let j = 1; j <= loIdx; j++) if (win[j].h >= win[hiIdx].h) hiIdx = j;
  if (hiIdx >= loIdx) return null;
  const hi = win[hiIdx].h, lo = win[loIdx].l, range = hi - lo;
  if (!(range > 0)) return null;
  const bottom = lo + FIB_ZONE_MIN * range, top = lo + FIB_ZONE_MAX * range;
  if (k.h < bottom || k.h > top || k.c >= top) return null;
  return { ratio: (k.h - lo) / range };
}
