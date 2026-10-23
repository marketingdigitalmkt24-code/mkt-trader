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
