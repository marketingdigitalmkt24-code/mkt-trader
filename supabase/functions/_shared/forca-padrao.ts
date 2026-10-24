export const FORCA_PADRAO = 'FORCA_PADRAO_V1';
type Candle = { t: number; o: number; c: number; h: number; l: number };
// Provisional prospective Demo rule (user request 24/10/2026), from the confirmed win
// US30/JP225-OTC 01:29 BRT CALL VELA_FORCA: two same-direction candles, the last one nearly
// full-body closing at its extreme, body growing vs the previous, last 5 closes advancing.
// Features stop before entry; never a principal order, Telegram or copy.
export function demoForcaPadrao(candles: Candle[], entry: number) {
  if (!Number.isFinite(entry) || entry % 60 !== 0) return null;
  const cs = candles.filter(k => k.t < entry).slice(-100);
  if (cs.length !== 100 || cs.some((k, i) => k.t !== entry - (100 - i) * 60
    || ![k.t, k.o, k.c, k.h, k.l].every(Number.isFinite) || k.o <= 0 || k.c <= 0
    || k.h < Math.max(k.o, k.c) || k.l > Math.min(k.o, k.c))) return null;
  const prev = cs[98], last = cs[99];
  const prevRange = prev.h - prev.l, lastRange = last.h - last.l;
  if (!(prevRange > 0 && lastRange > 0)) return null;
  const dir = last.c > last.o ? 'CALL' : last.c < last.o ? 'PUT' : null;
  if (!dir) return null;
  const s = dir === 'CALL' ? 1 : -1;
  const prevBody = s * (prev.c - prev.o), lastBody = s * (last.c - last.o);
  if (!(prevBody > 0 && lastBody >= prevBody)) return null;
  if (prevBody / prevRange < 0.5 || lastBody / lastRange < 0.9) return null;
  // Last candle must close at its extreme: counter wick at most 5% of the range.
  const counterWick = dir === 'CALL' ? last.h - last.c : last.c - last.l;
  if (counterWick / lastRange > 0.05) return null;
  // Last 5 closes must advance in the trade direction.
  for (let i = 95; i < 99; i++) if (s * (cs[i + 1].c - cs[i].c) <= 0) return null;
  return { direction: dir as 'CALL' | 'PUT', bodyRatio: lastBody / lastRange };
}
