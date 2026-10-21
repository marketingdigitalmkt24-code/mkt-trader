import type { Candle } from './bias.ts';
export const PREVIOUS_RULE = { seconds: 60, warmup: 100, atrPeriod: 14, maxExtension: 1.5, maxStreakExclusive: 4, maxRejectionWick: 0.5 };
// Research only; frozen before collecting outcomes. Streak includes last closed candle.
export function previousCandles(candles: Candle[], entry: number, direction: string) {
  const last = Math.floor(entry / 60) * 60 - 60;
  const byTime = new Map(candles.filter(k => k.t % 60 === 0 && k.t + 60 <= entry
    && [k.t,k.o,k.c,k.h,k.l].every(Number.isFinite) && k.h >= Math.max(k.o,k.c) && k.l <= Math.min(k.o,k.c)).map(k => [k.t,k]));
  const cs: Candle[] = [];
  for (let i = 99; i >= 0; i--) {
    const k = byTime.get(last - i * 60);
    if (!k) return { coverage: 'MISSING', lastClosed: null };
    cs.push(k);
  }
  const sign = direction === 'CALL' ? 1 : direction === 'PUT' ? -1 : 0;
  if (!sign) return { coverage: 'MISSING', lastClosed: null };
  let ema = cs[0].c, atr = 0;
  for (let i = 1; i < cs.length; i++) {
    const k = cs[i], prev = cs[i-1];
    ema += 2 / 22 * (k.c - ema);
    const tr = Math.max(k.h-k.l, Math.abs(k.h-prev.c), Math.abs(k.l-prev.c));
    if (i <= 14) atr += tr / 14;
    else atr = (atr * 13 + tr) / 14;
  }
  const k = cs[99], range = k.h-k.l;
  if (!(atr > 0 && range > 0)) return { coverage: 'MISSING', lastClosed: null };
  let streak = 0;
  for (let i = 99; i >= 0 && sign * (cs[i].c-cs[i].o) > 0; i--) streak++;
  // Signed extension deliberately allows closes on the opposite side of EMA21.
  const extensionAtr = sign * (k.c-ema) / atr;
  const rejectionWick = (sign === 1 ? k.h-Math.max(k.o,k.c) : Math.min(k.o,k.c)-k.l) / range;
  const noExtension = extensionAtr <= PREVIOUS_RULE.maxExtension;
  const noLongStreak = streak < PREVIOUS_RULE.maxStreakExclusive;
  const noRejection = rejectionWick <= PREVIOUS_RULE.maxRejectionWick;
  return { coverage: 'OK', lastClosed: last+60, ema21: ema, atr14: atr, extensionAtr, streak, rejectionWick,
    noExtension, noLongStreak, noRejection, combined: noExtension && noLongStreak && noRejection };
}