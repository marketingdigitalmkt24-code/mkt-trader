export const DEMO_CONTINUATION = 'CONTINUACAO_QUEDA_V1';
export type DemoCandidate = { signal_id: string; asset: string; direction: string; entry_strategy: string; created_at: string; _score: number };
type Candle = { t: number; o: number; c: number; h: number; l: number };
// Provisional prospective rule, not an accuracy claim. Features stop before entry.
export function demoContinuation(candles: Candle[], entry: number) {
  if (!Number.isFinite(entry) || entry % 60 !== 0) return null;
  const cs = candles.filter(k => k.t < entry).slice(-100);
  if (cs.length !== 100 || cs.some((k, i) => k.t !== entry - (100 - i) * 60
    || ![k.t,k.o,k.c,k.h,k.l].every(Number.isFinite) || k.o <= 0 || k.c <= 0
    || k.h < Math.max(k.o,k.c) || k.l > Math.min(k.o,k.c))) return null;
  const last = cs[99], range = last.h - last.l;
  const body = last.o - last.c;
  if (!(range > 0 && body > 0)) return null;
  const bodyRatio = body / range, lowerWick = (last.c - last.l) / range;
  if (bodyRatio < 0.7 || lowerWick > 0.1) return null;
  let e9 = cs[0].c, e21 = cs[0].c;
  for (const k of cs.slice(1)) { e9 += 2 / 10 * (k.c - e9); e21 += 2 / 22 * (k.c - e21); }
  const sma50 = cs.slice(-50).reduce((s,k) => s+k.c,0)/50;
  if (!(e9 < e21 && e21 < sma50 && last.c < e21)) return null;
  let streak = 0;
  for (let i = 99; i >= 0 && cs[i].c < cs[i].o; i--) streak++;
  if (streak > 3) return null;
  return { direction: 'PUT' as const, bodyRatio, lowerWick, streak };
}
export function chooseDemoCandidate(candidates: DemoCandidate[]) {
  return candidates.filter(c => Number.isFinite(c._score) && c._score >= 0)
    .sort((a,b) => b._score-a._score || a.signal_id.localeCompare(b.signal_id))[0] ?? null;
}export const DEMO_CEILING = 'TETO_V1';
// Provisional: red candle then green candle closing back at the red open (prior top); PUT next minute.
export function demoCeiling(candles: Candle[], entry: number) {
  if (!Number.isFinite(entry) || entry % 60 !== 0) return null;
  const cs = candles.filter(k => k.t < entry).slice(-100);
  if (cs.length !== 100 || cs.some((k, i) => k.t !== entry - (100 - i) * 60
    || ![k.t,k.o,k.c,k.h,k.l].every(Number.isFinite) || k.o <= 0 || k.c <= 0
    || k.h < Math.max(k.o,k.c) || k.l > Math.min(k.o,k.c))) return null;
  const prev = cs[98], last = cs[99];
  const prevBody = prev.o - prev.c, lastBody = last.c - last.o;
  const prevRange = prev.h - prev.l, lastRange = last.h - last.l;
  if (!(prevBody > 0 && lastBody > 0 && prevRange > 0 && lastRange > 0)) return null;
  if (prevBody / prevRange < 0.6 || lastBody / lastRange < 0.6) return null;
  const gap = Math.abs(last.c - prev.o) / prevBody;
  if (gap > 0.1 || last.h > prev.h + 0.1 * prevBody) return null;
  return { direction: 'PUT' as const, match: 1 - gap };
}
type DemoOutcome = { entry_strategy: string; entry_minute: string; result: string; profit: number };
// Learns from confirmed Demo broker outcomes: strategy+BRT hour weighs most, then strategy overall; losses weigh more.
export function demoLearningAdjustment(history: DemoOutcome[], strategy: string, entryMs: number) {
  const hour = (h: string | number) => (new Date(typeof h === 'number' ? h : Date.parse(h)).getUTCHours() + 21) % 24;
  const h = hour(entryMs);
  const score = (rows: DemoOutcome[]) => {
    const w = rows.filter(r => r.result === 'win').length, l = rows.filter(r => r.result === 'loss').length;
    return w + l ? (w - 1.2 * l) / (w + l) * Math.min(1, (w + l) / 5) : 0;
  };
  const same = history.filter(r => r.entry_strategy === strategy);
  const adj = 0.6 * score(same.filter(r => hour(r.entry_minute) === h)) + 0.4 * score(same);
  return Math.max(-1, Math.min(1, adj));
}
// Chart-shape learning: compares the last 5 closed candles (oriented to the trade direction) with
// confirmed Demo outcomes whose pre-entry candles were saved. Features stop before each entry.
export function chartFeatures(candles: Candle[], entry: number, direction: string) {
  const cs = candles.filter(k => k.t < entry).slice(-20);
  if (cs.length < 20) return null;
  const hi = Math.max(...cs.map(k => k.h)), lo = Math.min(...cs.map(k => k.l)), span = hi - lo;
  if (!(span > 0)) return null;
  const s = direction === 'PUT' ? -1 : 1, f: number[] = [];
  for (const k of cs.slice(-5)) {
    const r = k.h - k.l || span;
    const up = (k.h - Math.max(k.o, k.c)) / r, dn = (Math.min(k.o, k.c) - k.l) / r;
    f.push(s * (k.c - k.o) / r, s > 0 ? up : dn, s > 0 ? dn : up, (k.h - k.l) / span);
  }
  const pos = (cs[19].c - lo) / span;
  f.push(s > 0 ? pos : 1 - pos);
  return f;
}
export type ChartSample = { f: number[]; result: string };
export function chartPatternAdjustment(samples: ChartSample[], f: number[] | null, k = 7) {
  if (!f) return 0;
  const near = samples.filter(x => x.f.length === f.length && (x.result === 'win' || x.result === 'loss'))
    .map(x => ({ x, d: Math.sqrt(x.f.reduce((a, v, i) => a + (v - f[i]) ** 2, 0)) }))
    .sort((a, b) => a.d - b.d).slice(0, k);
  if (near.length < 3) return 0;
  let w = 0, sum = 0;
  for (const { x, d } of near) { const wt = 1 / (0.1 + d); w += wt; sum += wt * (x.result === 'win' ? 1 : -1.2); }
  return Math.max(-1, Math.min(1, (sum / w) * Math.min(1, near.length / k)));
}
// User reference (GEV-OTC 23/10 17:42 PUT WIN): Demo only enters charts close to it.
export const DEMO_REFERENCE_SIGNAL = 'demo-continuation-v1-GEV-OTC-1792788120';
export const DEMO_REFERENCE_MAX_DISTANCE = 0.9;
export function similarToReference(ref: number[] | null, f: number[] | null, max = DEMO_REFERENCE_MAX_DISTANCE) {
  if (!ref || !f || ref.length !== f.length) return false;
  return Math.sqrt(ref.reduce((a, v, i) => a + (v - f[i]) ** 2, 0)) <= max;
}
