export const FORCE_FIRST_TEST = 'FORCA_SEM_ROMPIMENTO_PRIMEIRA';
type Candle = { t: number; o: number; c: number; h: number; l: number };
type BaseTest = { signal_id: string; asset: string; direction: string; entry_strategy: string; timeframe: string; created_at: string; expiration_time: string; entry_price: number; result: string; profit: number };

// Shadow the selected original Force TEST, never participate in ranking or claims.
export function forceFirstObservation(base: BaseTest, candles: Candle[]) {
  if (base.entry_strategy !== 'VELA_FORCA' || base.timeframe !== 'TEST'
    || !base.signal_id.startsWith('t7-') || base.result !== 'test7_open') return null;
  const entry = Date.parse(base.created_at) / 1000;
  if (!Number.isFinite(entry) || entry % 60 !== 0) return null;
  const sign = base.direction === 'CALL' ? 1 : base.direction === 'PUT' ? -1 : 0;
  if (!sign) return null;
  const byTime = new Map(candles.filter(k => k.t + 60 <= entry).map(k => [k.t, k]));
  const cs: Candle[] = [];
  for (let i = 21; i >= 1; i--) {
    const k = byTime.get(entry - i * 60);
    if (!k || ![k.t, k.o, k.c, k.h, k.l].every(Number.isFinite)
      || k.h < Math.max(k.o, k.c) || k.l > Math.min(k.o, k.c)) return null;
    cs.push(k);
  }
  const last = cs[20], prev = cs[19], prior = cs.slice(0, 20);
  const body = sign * (last.c - last.o);
  const mean = prior.reduce((sum, k) => sum + Math.abs(k.c - k.o), 0) / 20;
  if (!(mean > 0 && body > 2 * mean) || sign * (prev.c - prev.o) > 0) return null;
  const breaks = sign === 1 ? last.c > Math.max(...prior.map(k => k.h)) : last.c < Math.min(...prior.map(k => k.l));
  if (breaks) return null;
  return {
    signal_id: `study-force-first-${base.signal_id}`, asset: base.asset, direction: base.direction,
    entry_strategy: FORCE_FIRST_TEST, timeframe: 'TEST', result: 'test7_open', profit: 0,
    created_at: base.created_at, expiration_time: base.expiration_time, entry_price: base.entry_price,
    is_auto_trade: false, is_ai_analyzed: false, telegram_sent: false,
    test_sequence_strategy: null, test_inverted_strategy: null,
  };
}