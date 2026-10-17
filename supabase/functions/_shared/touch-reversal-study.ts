import type { Candle, Counts } from './resistance-study.ts';

type Variant = 'resistanceTouch' | 'resistanceRejection' | 'supportTouch' | 'supportRejection';
export function touchReversalStudy(cs: Candle[], end: number) {
  const variants: Variant[] = ['resistanceTouch', 'resistanceRejection', 'supportTouch', 'supportRejection'];
  const counts = () => ({ wins: 0, losses: 0, ties: 0 });
  const result = Object.fromEntries(variants.map(v => [v, { search: counts(), validation: counts() }])) as Record<Variant, { search: Counts; validation: Counts }>;
  const last: Record<Variant, number> = { resistanceTouch: -Infinity, resistanceRejection: -Infinity, supportTouch: -Infinity, supportRejection: -Infinity };
  const highs: number[] = [], lows: number[] = [];
  let hh = 0, lh = 0, rangeSum = 0, gaps = 0;
  for (let i = 0; i < cs.length - 1; i++) {
    if (i > 0) {
      const j = i - 1;
      rangeSum += cs[j].h - cs[j].l;
      if (j > 0 && cs[j].t - cs[j - 1].t !== 60) gaps++;
      while (highs.length > hh && cs[highs[highs.length - 1]].h <= cs[j].h) highs.pop();
      while (lows.length > lh && cs[lows[lows.length - 1]].l >= cs[j].l) lows.pop();
      highs.push(j); lows.push(j);
    }
    if (i > 60) {
      const old = i - 61;
      rangeSum -= cs[old].h - cs[old].l;
      if (cs[old + 1].t - cs[old].t !== 60) gaps--;
    }
    while (hh < highs.length && highs[hh] < i - 60) hh++;
    while (lh < lows.length && lows[lh] < i - 60) lh++;
    if (i < 60) continue;
    const k = cs[i], next = cs[i + 1];
    if (next.t < end - 30 * 86400 || next.t + 60 > end || next.t - k.t !== 60) continue;
    if (gaps || k.t - cs[i - 1].t !== 60) continue;
    const range = rangeSum / 60;
    if (!(range > 0)) continue;
    const resistance = cs[highs[hh]].h, support = cs[lows[lh]].l;
    const tol = range * 0.15;
    // Prior 10 closed candles must approach the level; never inspect the outcome candle.
    const rising = cs[i - 1].c > cs[i - 10].c, falling = cs[i - 1].c < cs[i - 10].c;
    const rt = rising && k.h >= resistance - tol && k.h <= resistance + tol && k.c <= resistance + tol;
    const st = falling && k.l >= support - tol && k.l <= support + tol && k.c >= support - tol;
    const body = Math.abs(k.c - k.o);
    const conditions: Record<Variant, boolean> = {
      resistanceTouch: rt,
      resistanceRejection: rt && k.c < k.o && k.c < resistance - tol && k.h - Math.max(k.o, k.c) >= body,
      supportTouch: st,
      supportRejection: st && k.c > k.o && k.c > support + tol && Math.min(k.o, k.c) - k.l >= body,
    };
    for (const v of variants) {
      // One event per level cluster: at least 10 minutes between entries per variant/asset.
      if (!conditions[v] || next.t - last[v] < 600) continue;
      const s = result[v][next.t < end - 10 * 86400 ? 'search' : 'validation'];
      const delta = (next.c - next.o) * (v.startsWith('support') ? 1 : -1);
      if (delta > 0) s.wins++; else if (delta < 0) s.losses++; else s.ties++;
      last[v] = next.t;
    }
  }
  return result;
}