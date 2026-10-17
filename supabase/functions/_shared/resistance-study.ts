export type Candle = { t: number; o: number; c: number; h: number; l: number };
export type Counts = { wins: number; losses: number; ties: number };
export function fiveTouches(cs: Candle[], i: number): boolean {
  if (i < 180) return false;
  // Fix the level using only the 60 candles BEFORE the 120-candle observation window.
  const start = i - 119;
  const prior = cs.slice(start - 60, start);
  const level = Math.max(...prior.map(k => k.h));
  const atr = prior.reduce((s, k) => s + k.h - k.l, 0) / prior.length;
  if (!(atr > 0) || prior[59].c <= prior[0].c) return false;
  const tolerance = atr * 0.15;
  let touches = 0, armed = true;
  for (let j = start; j <= i; j++) {
    const k = cs[j];
    if (j > start && k.t - cs[j - 1].t !== 60) return false;
    if (k.c > level + tolerance) return false; // confirmed breakout invalidates resistance
    if (armed && k.h >= level - tolerance && k.h <= level + tolerance) {
      touches++;
      armed = false;
      if (j === i) return touches === 5;
    } else if (!armed && k.h < level - atr * 0.5) {
      armed = true; // adjacent candles at the level are one touch, not several
    }
  }
  return false;
}
export function resistanceStudy(cs: Candle[], end: number) {
  const split = end - 10 * 86400, begin = end - 30 * 86400;
  const result: Record<string, Counts> = { search: { wins: 0, losses: 0, ties: 0 }, validation: { wins: 0, losses: 0, ties: 0 } };
  let lastEntry = -Infinity;
  for (let i = 180; i < cs.length - 1; i++) {
    const nx = cs[i + 1];
    if (nx.t < begin || nx.t + 60 > end || nx.t - cs[i].t !== 60 || nx.t - lastEntry < 120 * 60) continue;
    if (!fiveTouches(cs, i)) continue;
    const s = result[nx.t < split ? 'search' : 'validation'];
    if (nx.c < nx.o) s.wins++; else if (nx.c > nx.o) s.losses++; else s.ties++;
    lastEntry = nx.t;
  }
  return result;
}