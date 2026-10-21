export type Candle = { t: number; o: number; c: number; h: number; l: number };
export type Bias = 'CALL' | 'PUT' | 'NEUTRAL' | 'MISSING';
export const RULE = { seconds: 900, warmup: 100, fast: 9, slow: 21 };
// Fixed before collection: EMA9/EMA21, price vs EMA21, and EMA21 slope.
// Only a contiguous 100-bar window ending at the last closed M15 is accepted.
export function marketBias(candles: Candle[], entry: number): { bias: Bias; lastClosed: number | null } {
  const boundary = Math.floor(entry / RULE.seconds) * RULE.seconds;
  const last = boundary - RULE.seconds;
  const byTime = new Map(candles.filter(k => k.t % RULE.seconds === 0 && k.t + RULE.seconds <= entry
    && [k.t, k.o, k.c, k.h, k.l].every(Number.isFinite)).map(k => [k.t, k]));
  const closes: number[] = [];
  for (let i = RULE.warmup - 1; i >= 0; i--) {
    const k = byTime.get(last - i * RULE.seconds);
    if (!k) return { bias: 'MISSING', lastClosed: null };
    closes.push(k.c);
  }
  let fast = closes[0], slow = closes[0], previousSlow = slow;
  for (const c of closes.slice(1)) {
    previousSlow = slow;
    fast += 2 / (RULE.fast + 1) * (c - fast);
    slow += 2 / (RULE.slow + 1) * (c - slow);
  }
  const price = closes[closes.length - 1];
  const bias = fast > slow && price > slow && slow > previousSlow ? 'CALL'
    : fast < slow && price < slow && slow < previousSlow ? 'PUT' : 'NEUTRAL';
  return { bias, lastClosed: last + RULE.seconds };
}
// Punctuation may differ; OTC identity must never be removed or substituted.
export const exactAssetKey = (s: string) => s.toUpperCase().replace(/^FRONT\./, '').replace(/[^A-Z0-9]/g, '').replace(/OP$/, '');