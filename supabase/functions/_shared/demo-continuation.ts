export const DEMO_CONTINUATION = 'CONTINUACAO_QUEDA_V1';
export type DemoCandidate = { signal_id: string; asset: string; direction: string; entry_strategy: string; created_at: string; _score: number; _preferredPatternDistance?: number };
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
// Preserve exact principal authorization first; then prefer the user's winning-score cohort
// and its pre-entry chart shapes, without changing the calculated score or eligibility gates.
export const DEMO_PREFERRED_SCORE_CENTS = [226, 223, 218, 264, 288, 203, 269, 291, 204, 261, 278, 237, 276, 220] as const;
export function demoPreferredScore(score: number) {
  return Number.isFinite(score) && DEMO_PREFERRED_SCORE_CENTS.some(c => c === Math.round(score * 100));
}
const DEMO_TARGET_SCORE_CENTS = 226;
const scoreDistance = (s: number) => Math.abs(Math.round(s * 100) - DEMO_TARGET_SCORE_CENTS);
export function demoPreferredPatternAllowed(distance: number | undefined) {
  return typeof distance === 'number' && Number.isFinite(distance) && distance >= 0 && distance <= DEMO_REFERENCE_MAX_DISTANCE;
}
export function chooseDemoCandidate(candidates: DemoCandidate[], preferWinningScores = false, scorePriority?: number[]) {
  const tier = (c: DemoCandidate) => {
    if (scorePriority && preferWinningScores) {
      const rank = scorePriority.indexOf(Math.round(c._score * 100));
      return rank >= 0 ? rank : scorePriority.length;
    }
    if (scoreDistance(c._score) === 0) return 0;
    if (!preferWinningScores) return 1;
    const matched = Number.isFinite(c._preferredPatternDistance) && Number(c._preferredPatternDistance) <= DEMO_REFERENCE_MAX_DISTANCE;
    if (demoPreferredScore(c._score)) return matched ? 1 : 2;
    return matched ? 3 : 4;
  };
  return candidates.filter(c => Number.isFinite(c._score) && c._score >= 0
    && (!preferWinningScores || demoPreferredPatternAllowed(c._preferredPatternDistance)))
    .sort((a,b) => tier(a)-tier(b)
      || (preferWinningScores ? (a._preferredPatternDistance ?? Infinity) - (b._preferredPatternDistance ?? Infinity) : 0)
      || scoreDistance(a._score)-scoreDistance(b._score) || b._score-a._score || a.signal_id.localeCompare(b.signal_id))[0] ?? null;
}
export const DEMO_CEILING = 'TETO_V1';
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
type DemoOutcome = { entry_strategy: string; entry_minute: string; result: string; profit: number; asset?: string };
// Learns from confirmed Demo broker outcomes: strategy overall weighs most (0.6), then strategy+BRT hour (0.4);
// losses weigh more. The hour bonus needs at least 3 outcomes so a single win cannot inflate the score.
export function demoLearningAdjustment(history: DemoOutcome[], strategy: string, entryMs: number) {
  const hour = (h: string | number) => (new Date(typeof h === 'number' ? h : Date.parse(h)).getUTCHours() + 21) % 24;
  const h = hour(entryMs);
  const score = (rows: DemoOutcome[], minSamples = 1) => {
    const w = rows.filter(r => r.result === 'win').length, l = rows.filter(r => r.result === 'loss').length;
    if (w + l < minSamples) return 0;
    return (w - 1.2 * l) / (w + l) * Math.min(1, (w + l) / 5);
  };
  const same = history.filter(r => r.entry_strategy === strategy);
  const adj = 0.4 * score(same.filter(r => hour(r.entry_minute) === h), 3) + 0.6 * score(same);
  return Math.max(-1, Math.min(1, adj));
}
// Profit-aware learning per strategy+asset: net profit and win rate on that exact pair; losses weigh more.
export function demoAssetAdjustment(history: DemoOutcome[], strategy: string, asset: string) {
  const rows = history.filter(r => r.entry_strategy === strategy && r.asset === asset);
  const w = rows.filter(r => r.result === 'win').length, l = rows.filter(r => r.result === 'loss').length;
  if (w + l < 3) return 0;
  const net = rows.reduce((s, r) => s + (Number(r.profit) || 0), 0);
  const wr = (w - 1.2 * l) / (w + l);
  const pf = net > 0 ? 1 : net < 0 ? -1 : 0;
  return Math.max(-1, Math.min(1, 0.6 * wr + 0.4 * pf * Math.min(1, (w + l) / 8)));
}
// Combined learned score below this (with evidence) blocks the Demo entry: seek only profitable patterns.
// Stricter conservative gate (user, Oct 24 2026): cut strategies in a losing phase earlier.
export const DEMO_LEARNED_REJECT = -0.8;
// Demo entry floor (user, Oct 24 2026 05:59 UTC): only candidates with final score >= 2.0 open in Demo.
export const DEMO_MIN_SCORE = 2.0;
export function demoScoreAllowed(score: number) {
  return Number.isFinite(score) && score >= DEMO_MIN_SCORE;
}
export function demoLearnedReject(adjustment: number) {
  return adjustment <= DEMO_LEARNED_REJECT;
}
// Real principal IQ outcomes weigh 1.5x over Demo history: patterns with real profit prioritize candidates more.
export const REAL_LEARNING_WEIGHT = 1.5;
export function combinedLearnedScore(
  demoHist: DemoOutcome[], realHist: DemoOutcome[], chartAdj: number,
  strategy: string, asset: string, entryMs: number,
) {
  const demo = demoLearningAdjustment(demoHist, strategy, entryMs) + demoAssetAdjustment(demoHist, strategy, asset);
  const real = demoLearningAdjustment(realHist, strategy, entryMs) + demoAssetAdjustment(realHist, strategy, asset);
  return demo + REAL_LEARNING_WEIGHT * real + chartAdj;
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
export type ChartSample = { f: number[]; result: string; score?: number };
export function demoPreferredPatternDistance(samples: ChartSample[], f: number[] | null) {
  if (!f || !f.every(Number.isFinite)) return Infinity;
  const distances = samples.filter(s => s.result === 'win' && demoPreferredScore(s.score ?? NaN)
    && s.f.length === f.length && s.f.every(Number.isFinite))
    .map(s => Math.sqrt(s.f.reduce((sum, v, i) => sum + (v - f[i]) ** 2, 0)));
  return distances.length ? Math.min(...distances) : Infinity;
}
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
// Wider provisional tolerance for more eligible Demo candidates; never bypass the reference filter.
export const DEMO_REFERENCE_MAX_DISTANCE = 1.3;
export function similarToReference(ref: number[] | null, f: number[] | null, max = DEMO_REFERENCE_MAX_DISTANCE) {
  if (!ref || !f || ref.length !== f.length) return false;
  return Math.sqrt(ref.reduce((a, v, i) => a + (v - f[i]) ** 2, 0)) <= max;
}
// Seek charts like any confirmed winner: true when the chart is close to at least one reference.
export function similarToAnyReference(refs: (number[] | null)[], f: number[] | null, max = DEMO_REFERENCE_MAX_DISTANCE) {
  if (!f) return false;
  return refs.some(r => similarToReference(r, f, max));
}

// Queda history over signal (user, Oct 24 2026 06:12 UTC): for Continuação de queda the learned
// history weighs 4x (vs 2x) and any losing history caps the score below the 2.0 Demo floor.
export const QUEDA_HISTORY_WEIGHT = 4;
export function demoFinalScore(base: number, learn: number, strategy: string) {
  if (strategy === DEMO_CONTINUATION) {
    const s = Math.max(0, base + QUEDA_HISTORY_WEIGHT * learn);
    return learn < 0 ? Math.min(s, DEMO_MIN_SCORE - 0.01) : s;
  }
  return Math.max(0, base + 2 * learn);
}
