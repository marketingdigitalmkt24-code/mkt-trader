import type { Candle } from './bias.ts';
// Research only, frozen before outcomes: predicts the NEXT M1 candle from closed candles; never trades.
export const ANTICIPATE_RULE = { seconds: 60, warmup: 100, rsiPeriod: 14, callRsi: [50, 70], putRsi: [30, 50],
  squeezePct: 0.2, bandPeriod: 20, edgeShare: 0.25, strongBodyAtr: 1 };
type Pred = { coverage: 'OK' | 'MISSING'; signal: 'CALL' | 'PUT' | 'NONE'; rsi?: number; squeeze?: boolean; edge?: number; atr?: number };
/** cs = 100 consecutive closed M1 candles, oldest first; the predicted candle is not included. */
export function anticipate(cs: Candle[]): Pred {
  if (cs.length !== 100 || cs.some((k, i) => i && k.t - cs[i - 1].t !== 60)) return { coverage: 'MISSING', signal: 'NONE' };
  let e9 = cs[0].c, e21 = cs[0].c, atr = 0, gain = 0, loss = 0;
  const widths: number[] = [];
  for (let i = 1; i < 100; i++) {
    const k = cs[i], p = cs[i - 1], d = k.c - p.c;
    e9 += 2 / 10 * (k.c - e9); e21 += 2 / 22 * (k.c - e21);
    const tr = Math.max(k.h - k.l, Math.abs(k.h - p.c), Math.abs(k.l - p.c));
    atr = i <= 14 ? atr + tr / 14 : (atr * 13 + tr) / 14;
    gain = i <= 14 ? gain + Math.max(d, 0) / 14 : (gain * 13 + Math.max(d, 0)) / 14;
    loss = i <= 14 ? loss + Math.max(-d, 0) / 14 : (loss * 13 + Math.max(-d, 0)) / 14;
    if (i >= 19) {
      const w = cs.slice(i - 19, i + 1).map(x => x.c), m = w.reduce((a, b) => a + b, 0) / 20;
      widths.push(4 * Math.sqrt(w.reduce((a, b) => a + (b - m) ** 2, 0) / 20) / m);
    }
  }
  const rsi = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  const last = cs[99], now = widths.at(-1)!;
  const squeeze = widths.filter(w => w < now).length / widths.length <= ANTICIPATE_RULE.squeezePct;
  const box = cs.slice(80), hi = Math.max(...box.map(k => k.h)), lo = Math.min(...box.map(k => k.l));
  const edge = hi > lo ? (last.c - lo) / (hi - lo) : 0.5;
  if (!(atr > 0)) return { coverage: 'MISSING', signal: 'NONE' };
  const call = e9 > e21 && last.c > e21 && rsi >= 50 && rsi <= 70 && edge >= 1 - ANTICIPATE_RULE.edgeShare;
  const put = e9 < e21 && last.c < e21 && rsi >= 30 && rsi <= 50 && edge <= ANTICIPATE_RULE.edgeShare;
  return { coverage: 'OK', signal: squeeze && call ? 'CALL' : squeeze && put ? 'PUT' : 'NONE', rsi, squeeze, edge, atr };
}
/** Walks every minute; the outcome candle is only read after the prediction is fixed. */
export function evaluateAnticipation(raw: Candle[], start: number, end: number, split: number, otc: boolean, forceMinutes: Map<number, string>) {
  const cs = [...new Map(raw.map(k => [k.t, k])).values()].sort((a, b) => a.t - b.t);
  const idx = new Map(cs.map((k, i) => [k.t, i]));
  const tally = () => ({ signals: 0, wins: 0, losses: 0, ties: 0, strong: 0, forceSeen: 0, forceAnticipated: 0 });
  const out = { discovery: tally(), validation: tally(), market: otc ? 'OTC' : 'Regular', analyzedMinutes: 0 };
  for (const k of cs) {
    if (k.t < start || k.t >= end) continue;
    const i = idx.get(k.t)!; if (i < 100) continue;
    const p = anticipate(cs.slice(i - 100, i)); if (p.coverage !== 'OK') continue;
    out.analyzedMinutes++;
    const t = k.t < split ? out.discovery : out.validation;
    const force = forceMinutes.get(k.t);
    if (force) { t.forceSeen++; if (p.signal === force) t.forceAnticipated++; }
    if (p.signal === 'NONE') continue;
    const s = p.signal === 'CALL' ? 1 : -1, body = s * (k.c - k.o);
    t.signals++; if (body > 0) t.wins++; else if (body < 0) t.losses++; else t.ties++;
    if (body >= ANTICIPATE_RULE.strongBodyAtr * p.atr!) t.strong++;
  }
  return out;
}
