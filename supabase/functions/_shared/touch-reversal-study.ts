import type { Candle, Counts } from './resistance-study.ts';

type Variant = 'resistanceTouch' | 'resistanceRejection' | 'supportTouch' | 'supportRejection';
export function touchReversalStudy(cs: Candle[], end: number) {
  const variants: Variant[] = ['resistanceTouch', 'resistanceRejection', 'supportTouch', 'supportRejection'];
  const counts = () => ({ wins: 0, losses: 0, ties: 0 });
  const result = Object.fromEntries(variants.map(v => [v, { search: counts(), validation: counts() }])) as Record<Variant, { search: Counts; validation: Counts }>;
  const last: Record<Variant, number> = { resistanceTouch: -Infinity, resistanceRejection: -Infinity, supportTouch: -Infinity, supportRejection: -Infinity };
  for (let i = 60; i < cs.length - 1; i++) {
    const k = cs[i], next = cs[i + 1], prior = cs.slice(i - 60, i);
    if (next.t < end - 30 * 86400 || next.t + 60 > end || next.t - k.t !== 60) continue;
    if (prior.some((p, j) => (j ? p.t - prior[j - 1].t : k.t - prior[59].t) !== 60)) continue;
    const range = prior.reduce((s, p) => s + p.h - p.l, 0) / 60;
    if (!(range > 0)) continue;
    const resistance = Math.max(...prior.map(p => p.h)), support = Math.min(...prior.map(p => p.l));
    const tol = range * 0.15;
    // Prior 10 closed candles must approach the level; never inspect the outcome candle.
    const rising = prior[59].c > prior[50].c, falling = prior[59].c < prior[50].c;
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