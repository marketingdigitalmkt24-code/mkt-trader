import { takashiKotegawa } from './takashi-kotegawa.ts';

export type ConfluenceCandle = { t: number; o: number; c: number; h: number; l: number; v?: number };

// Setup de 5 confirmações (user, Oct 30 2026): Takashi arms the direction; VWAP side,
// EMA 9/21 alignment, price-action structure (BOS/CHoCH or rejection of a key level) and
// rising volume must all confirm on the last closed candle before the :00 entry.
export const TAKASHI_ARM_LOOKBACK = 15;
export const VOLUME_RATIO_MIN = 1.2;

function ema(values: number[], period: number): number {
  const k = 2 / (period + 1);
  let e = values.slice(0, period).reduce((s, v) => s + v, 0) / period;
  for (let i = period; i < values.length; i++) e = values[i] * k + e * (1 - k);
  return e;
}

export function takashiConfluence(candles: ConfluenceCandle[], entry: number) {
  if (!Number.isFinite(entry) || entry % 60 !== 0) return null;
  // 1) Takashi — most recent signal within the arming window (exhaustion first, turn after).
  let armed: { direction: 'CALL' | 'PUT'; at: number; rsi: number; stretch: number } | null = null;
  for (let k = 0; k < TAKASHI_ARM_LOOKBACK && !armed; k++) {
    const at = entry - k * 60;
    const sig = takashiKotegawa(candles, at);
    if (sig) armed = { direction: sig.direction, at, rsi: sig.rsi, stretch: sig.stretch };
  }
  if (!armed) return null;
  const cs = candles.filter(c => c.t < entry).slice(-60);
  if (cs.length !== 60 || cs.some((c, i) => c.t !== entry - (60 - i) * 60)) return null;
  const call = armed.direction === 'CALL';
  const last = cs[59];
  const prev = cs.slice(0, 59);

  // Volume: broker tick volume when present, otherwise candle range as activity proxy.
  const hasVolume = cs.slice(-21).every(c => Number.isFinite(c.v) && (c.v as number) > 0);
  const activity = (c: ConfluenceCandle) => hasVolume ? (c.v as number) : c.h - c.l;

  // 2) VWAP over the 60-candle window (typical price weighted by activity).
  let pv = 0, vol = 0;
  for (const c of cs) { const w = hasVolume ? (c.v as number) : 1; pv += w * (c.h + c.l + c.c) / 3; vol += w; }
  const vwap = pv / vol;
  if (!(vwap > 0) || (call ? !(last.c > vwap) : !(last.c < vwap))) return null;

  // 3) EMA 9 / 21 aligned with the trade.
  const closes = cs.map(c => c.c);
  const ema9 = ema(closes, 9), ema21 = ema(closes, 21);
  if (call ? !(ema9 > ema21) : !(ema9 < ema21)) return null;

  // 4) Price action: break of the last swing (BOS/CHoCH) or rejection of the recent extreme.
  const recent = prev.slice(-20);
  let swing: number | null = null;
  for (let i = recent.length - 3; i >= 2 && swing === null; i--) {
    const x = recent[i];
    if (call && x.h > recent[i - 1].h && x.h > recent[i - 2].h && x.h >= recent[i + 1].h && x.h >= recent[i + 2].h) swing = x.h;
    if (!call && x.l < recent[i - 1].l && x.l < recent[i - 2].l && x.l <= recent[i + 1].l && x.l <= recent[i + 2].l) swing = x.l;
  }
  const range = last.h - last.l;
  const body = Math.abs(last.c - last.o);
  const wick = call ? Math.min(last.o, last.c) - last.l : last.h - Math.max(last.o, last.c);
  const extreme = call ? Math.min(...prev.slice(-10).map(c => c.l)) : Math.max(...prev.slice(-10).map(c => c.h));
  const rejection = range > 0 && wick >= 2 * body && wick >= range * 0.5
    && (call ? last.l <= extreme && last.c > last.l + range / 2 : last.h >= extreme && last.c < last.h - range / 2);
  const broke = swing !== null && (call ? last.c > swing : last.c < swing);
  if (!broke && !rejection) return null;
  // Armed Takashi means the prior move ran against the trade, so a break there is a change of character.
  const structure = broke ? (armed.at < entry ? 'CHOCH' : 'BOS') : 'REJECTION';

  // 5) Volume confirmation: last candle above the 20-candle average.
  const base = prev.slice(-20).reduce((s, c) => s + activity(c), 0) / 20;
  const volumeRatio = base > 0 ? activity(last) / base : 0;
  if (!(volumeRatio >= VOLUME_RATIO_MIN)) return null;

  return {
    direction: armed.direction, armedAt: armed.at, rsi: armed.rsi, stretch: armed.stretch,
    vwap, ema9, ema21, structure, volumeRatio, volumeSource: hasVolume ? 'tick' as const : 'range' as const,
  };
}
