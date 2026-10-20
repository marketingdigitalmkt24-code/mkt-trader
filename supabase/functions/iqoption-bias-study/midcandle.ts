import type { Candle } from './bias.ts';
// Research only, frozen before outcomes: at second 30 of a minute, enter with the half-candle if it is already
// strong; 60s expiry from the 30s close. Never trades; payout is a simulation assumption.
export const MID_RULE = { seconds: 30, warmup: 200, atrPeriod: 14, minHalfBodyAtr: 0.5, payout: 0.85, stake: 10 };
type Tally = { signals: number; wins: number; losses: number; ties: number; profit: number };
const tally = (): Tally => ({ signals: 0, wins: 0, losses: 0, ties: 0, profit: 0 });
/** half30: native 30s candles. force: minute -> direction of known Vela de Força candles (hindsight subset). */
export function evaluateMidCandle(half30: Candle[], start: number, end: number, split: number, force: Map<number, string>) {
  const h = new Map(half30.map(k => [k.t, k]));
  const out = { discovery: { all: tally(), force: tally(), nextOpen: tally() }, validation: { all: tally(), force: tally(), nextOpen: tally() }, analyzedMinutes: 0 };
  const add = (t: Tally, dir: number, entry: number, exit: number) => {
    const m = dir * (exit - entry); t.signals++;
    if (m > 0) { t.wins++; t.profit += MID_RULE.stake * MID_RULE.payout; } else if (m < 0) { t.losses++; t.profit -= MID_RULE.stake; } else t.ties++;
  };
  for (let m = Math.ceil(start / 60) * 60; m < end; m += 60) {
    // ATR from 14 previous fully closed M1 candles rebuilt from 30s halves; gaps disable the minute.
    const bars: { o: number; c: number; h: number; l: number }[] = [];
    for (let i = 15; i >= 1; i--) {
      const a = h.get(m - i * 60), b = h.get(m - i * 60 + 30);
      if (!a || !b) break;
      bars.push({ o: a.o, c: b.c, h: Math.max(a.h, b.h), l: Math.min(a.l, b.l) });
    }
    const first = h.get(m), second = h.get(m + 30), after = h.get(m + 60);
    if (bars.length !== 15 || !first || !second || !after) continue;
    let atr = 0;
    for (let i = 1; i < 15; i++) atr += Math.max(bars[i].h - bars[i].l, Math.abs(bars[i].h - bars[i - 1].c), Math.abs(bars[i].l - bars[i - 1].c)) / 14;
    if (!(atr > 0)) continue;
    out.analyzedMinutes++;
    const p = m < split ? out.discovery : out.validation;
    const body = first.c - first.o, dir = Math.sign(body);
    const known = force.get(m);
    const close2 = h.get(m + 90);
    if (known && close2) add(p.nextOpen, known === 'CALL' ? 1 : -1, after.o, close2.c); // current entry: next :00, 60s
    if (!dir || Math.abs(body) < MID_RULE.minHalfBodyAtr * atr) continue;
    // Entry at m+30 (first-half close), exit at m+90 (close of first half of next minute).
    add(p.all, dir, first.c, after.c);
    if (known) add(p.force, dir, first.c, after.c);
  }
  return out;
}
