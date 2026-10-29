export const TAKASHI_BNF = 'TAKASHI_BNF_V1';
type Candle = { t: number; o: number; c: number; h: number; l: number };

// Keep raw confluence/body evidence separate from outcome learning; never assign a target note.
export function takashiBaseScore(candle: Candle, confluenceCount: number): number {
  if (!Number.isFinite(confluenceCount) || confluenceCount < 0 || !Number.isFinite(candle.o)
    || !Number.isFinite(candle.c) || candle.o <= 0) return NaN;
  return confluenceCount + Math.min(0.99, 100 * Math.abs(candle.c - candle.o) / candle.o);
}

// Takashi Kotegawa (BNF) mean reversion, independent observations plus selected Demo cohort.
// The original rule bought stocks 20–35% below the 25-day moving average after panic selling;
// on M1 charts the same dislocation is measured against the asset's own recent amplitude
// (not the raw daily percentage). CALL when price closes far below its 25-candle SMA with
// RSI(14) oversold; PUT mirrored. Only selected candidates with displayed score 2.26
// may use the shared Demo/principal authorization; this detector never places orders.
export function takashiKotegawa(candles: Candle[], entry: number) {
  if (!Number.isFinite(entry) || entry % 60 !== 0) return null;
  const cs = candles.filter(k => k.t < entry).slice(-60);
  if (cs.length !== 60 || cs.some((k, i) => k.t !== entry - (60 - i) * 60
    || ![k.t, k.o, k.c, k.h, k.l].every(Number.isFinite) || k.o <= 0 || k.c <= 0
    || k.h < Math.max(k.o, k.c) || k.l > Math.min(k.o, k.c))) return null;
  const closes = cs.map(k => k.c);
  const price = closes[59];
  const sma25 = closes.slice(35).reduce((s, c) => s + c, 0) / 25;
  if (!(sma25 > 0)) return null;
  const deviation = (price - sma25) / sma25;
  const avgBody = cs.slice(35).reduce((s, k) => s + Math.abs(k.c - k.o), 0) / 25 / sma25;
  if (!(avgBody > 0)) return null;
  // RSI(14) Wilder, same smoothing as the shared detector.
  let ag = 0, al = 0;
  for (let j = 1; j < closes.length; j++) {
    const d = closes[j] - closes[j - 1], g = Math.max(d, 0), l = Math.max(-d, 0);
    if (j <= 14) { ag += g / 14; al += l / 14; } else { ag = (ag * 13 + g) / 14; al = (al * 13 + l) / 14; }
  }
  const rsi = al === 0 ? 100 : 100 - 100 / (1 + ag / al);
  const stretch = Math.abs(deviation) / avgBody;
  // Tightened thresholds (2026-10): Demo win rate 45.6% (CALL 52%, PUT 42%) vs ~55% breakeven;
  // require deeper dislocation (6x body, PUT 7x) and more extreme RSI to cut marginal signals.
  if (deviation < 0 && stretch >= 6 && rsi < 15) return { direction: 'CALL' as const, deviation, rsi, stretch };
  if (deviation > 0 && stretch >= 7 && rsi > 85) return { direction: 'PUT' as const, deviation, rsi, stretch };
  return null;
}
