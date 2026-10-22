export const FORCE_ANTICIPATION = 'FORCA_ANTECIPADA';
// Frozen experimental rule, not an assertion that the next candle will be strong.
export const ANTICIPATION_RULE_V2 = {
  warmup: 100, maxDelaySeconds: 30, bodyShareMax: 0.35, bodyMeanMax: 0.5,
  rsiMin: 45, rsiMax: 65, volumeRatioMin: 1, stake: 10, payout: 0.85,
} as const;
// Broader prospective hypothesis; historical Force examples are not proof of profit.
export const ANTICIPATION_RULE = {
  ...ANTICIPATION_RULE_V2, bodyShareMax: 0.65, bodyMeanMax: 0.85,
  rsiMin: 40, rsiMax: 75, volumeRatioMin: 0.5,
} as const;
export type AnticipationRule = { [K in keyof typeof ANTICIPATION_RULE_V2]: number };
export type AnticipationCandle = { t: number; o: number; c: number; h: number; l: number; v?: number };

export function anticipationSetup(raw: AnticipationCandle[], minute: number, rule: AnticipationRule = ANTICIPATION_RULE) {
  if (!Number.isFinite(minute) || minute % 60 !== 0) return null;
  const byTime = new Map(raw.filter(k => k.t + 60 <= minute).map(k => [k.t, k]));
  const cs: AnticipationCandle[] = [];
  for (let n = rule.warmup; n > 0; n--) {
    const k = byTime.get(minute - n * 60);
    if (!k || ![k.o, k.c, k.h, k.l].every(Number.isFinite)
      || k.l > Math.min(k.o, k.c) || k.h < Math.max(k.o, k.c)) return null;
    cs.push(k);
  }
  const last = cs[99], prev = cs[98], prior = cs.slice(79, 99);
  const direction = last.c < last.o && prev.c > prev.o ? 'CALL'
    : last.c > last.o && prev.c < prev.o ? 'PUT' : null;
  const body = Math.abs(last.o - last.c), range = last.h - last.l;
  const meanBody = prior.reduce((s, k) => s + Math.abs(k.c - k.o), 0) / 20;
  // First small countertrend candle; only completed candles decide.
  if (!(direction && body > 0 && range > 0 && meanBody > 0)
    || body / range > rule.bodyShareMax
    || body / meanBody > rule.bodyMeanMax) return null;
  // Missing/zero volume is not replaced by body size, ticks guessed from prices, or future volume.
  if (![...prior, last].every(k => typeof k.v === 'number' && Number.isFinite(k.v) && k.v > 0)) return null;
  const meanVolume = prior.reduce((s, k) => s + (k.v ?? 0), 0) / 20;
  const volumeRatio = (last.v ?? 0) / meanVolume;
  if (volumeRatio < rule.volumeRatioMin) return null;
  let ema9 = cs[0].c, ema21 = cs[0].c, gain = 0, loss = 0;
  for (let i = 1; i < cs.length; i++) {
    const delta = cs[i].c - cs[i - 1].c;
    ema9 += 2 / 10 * (cs[i].c - ema9);
    ema21 += 2 / 22 * (cs[i].c - ema21);
    gain = i <= 14 ? gain + Math.max(delta, 0) / 14 : (gain * 13 + Math.max(delta, 0)) / 14;
    loss = i <= 14 ? loss + Math.max(-delta, 0) / 14 : (loss * 13 + Math.max(-delta, 0)) / 14;
  }
  const sma50 = cs.slice(50).reduce((s, k) => s + k.c, 0) / 50;
  const rsi = loss === 0 ? (gain === 0 ? 50 : 100) : 100 - 100 / (1 + gain / loss);
  const aligned = direction === 'CALL' ? ema9 > ema21 && ema21 > sma50 && last.c > ema21
    : ema9 < ema21 && ema21 < sma50 && last.c < ema21;
  const rsiMin = direction === 'CALL' ? rule.rsiMin : 100 - rule.rsiMax;
  const rsiMax = direction === 'CALL' ? rule.rsiMax : 100 - rule.rsiMin;
  if (!aligned || rsi < rsiMin || rsi > rsiMax) return null;
  return { direction, ema9, ema21, sma50, rsi, volumeRatio, bodyShare: body / range, bodyMeanRatio: body / meanBody,
    ruleVersion: rule === ANTICIPATION_RULE_V2 ? 2 : 3, volumeSource: 'broker_reported', simulatedStake: 10, simulatedPayout: 0.85 };
}

export function anticipationObservation(asset: string, raw: AnticipationCandle[], now: number) {
  if (!Number.isFinite(now) || !asset) return null;
  const minute = Math.floor(now / 60) * 60;
  if (now - minute > ANTICIPATION_RULE.maxDelaySeconds) return null;
  const indicators = anticipationSetup(raw, minute);
  const current = raw.find(k => k.t === minute);
  // Actual observed intraminute quote, NOT the candle opening retroactively.
  if (!indicators || !current || !Number.isFinite(current.c) || current.c <= 0) return null;
  return { signal_id: `anticipation-v3-${asset}-${minute}`, asset, direction: indicators.direction,
    entry_minute: new Date(minute * 1000).toISOString(), created_at: new Date(now * 1000).toISOString(),
    expiration_time: new Date((minute + 60) * 1000).toISOString(), entry_price: current.c,
    result: 'open', profit: 0, indicators };
}

export function anticipationResult(entry: { entry_minute: string; entry_price: number; direction?: string }, raw: AnticipationCandle[], now: number) {
  if (entry.direction !== undefined && entry.direction !== 'CALL' && entry.direction !== 'PUT') return null;
  const minute = Date.parse(entry.entry_minute) / 1000;
  if (!Number.isFinite(minute) || !Number.isFinite(entry.entry_price) || now < minute + 60) return null;
  const k = raw.find(c => c.t === minute);
  if (!k || !Number.isFinite(k.c)) return null;
  const delta = (k.c - entry.entry_price) * (entry.direction === 'PUT' ? -1 : 1);
  return { exit_price: k.c, result: delta > 0 ? 'win' : delta < 0 ? 'loss' : 'tie',
    profit: delta > 0 ? ANTICIPATION_RULE.stake * ANTICIPATION_RULE.payout : delta < 0 ? -ANTICIPATION_RULE.stake : 0,
    settled_at: new Date(now * 1000).toISOString() };
}