// Extra confirmations for original Demo strategies (user, Nov 10 2026): a signal only enters when
// the signal candle closes in its direction, RSI is not exhausted, the market is moving and the
// longer trend (EMA50 slope over 10 bars) agrees. Uses only closed candles before the entry.
export type XK = { o: number; h: number; l: number; c: number };
export function demoExtraConfirmations(cs: XK[], direction: 'CALL' | 'PUT'): string | null {
  const i = cs.length - 1;
  if (i < 70) return 'history';
  const last = cs[i];
  if (direction === 'CALL' ? last.c <= last.o : last.c >= last.o) return 'candle';
  const c = cs.map(k => k.c);
  let ag = 0, al = 0, rsi = 50;
  for (let j = 1; j <= i; j++) {
    const d = c[j] - c[j - 1], g = Math.max(d, 0), l = Math.max(-d, 0);
    if (j <= 14) { ag += g / 14; al += l / 14; } else { ag = (ag * 13 + g) / 14; al = (al * 13 + l) / 14; }
    rsi = al === 0 ? 100 : 100 - 100 / (1 + ag / al);
  }
  if (direction === 'CALL' ? rsi >= 70 : rsi <= 30) return 'rsi';
  let avg = 0; for (let j = i - 20; j < i; j++) avg += cs[j].h - cs[j].l; avg /= 20;
  if (!(avg > 0) || last.h - last.l < 0.7 * avg) return 'movement';
  const k = 2 / 51; const e: number[] = [c[0]];
  for (let j = 1; j <= i; j++) e.push(c[j] * k + e[j - 1] * (1 - k));
  if (direction === 'CALL' ? e[i] <= e[i - 10] : e[i] >= e[i - 10]) return 'trend';
  return null;
}
