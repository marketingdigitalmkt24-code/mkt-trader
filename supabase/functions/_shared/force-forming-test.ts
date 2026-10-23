import type { AnticipationCandle } from './force-anticipation-test.ts';
import { iqMarketOpen, type IQMarketAsset } from './iq-market-open.ts';

export const FORCE_FORMING_PREFIX = 'force-forming-v1-';
export const FORCE_FORMING_STRATEGY = 'FORCA_EM_FORMACAO';

// Start observing at :00, but persist only the quote/time actually received.
export function forceFormingOpenObservation(asset: string, raw: AnticipationCandle[], now: number,
  markets: IQMarketAsset[], observationStart: number) {
  const minute = Math.floor(now / 60) * 60;
  if (observationStart !== minute || now < observationStart
    || !markets.some(m => iqMarketOpen(m, now, minute + 60))) return null;
  const observation = forceFormingObservation(asset, raw, now);
  if (!observation) return null;
  return { ...observation, indicators: { ...observation.indicators,
    observationStartedAt: new Date(observationStart * 1000).toISOString(),
    marketVerifiedAt: new Date(now * 1000).toISOString() } };
}

// Same body criterion as closed VELA_FORCA, but evaluated on an observed forming bar.
export function forceFormingObservation(asset: string, raw: AnticipationCandle[], now: number) {
  if (!asset || !Number.isFinite(now)) return null;
  const minute = Math.floor(now / 60) * 60;
  if (now - minute > 15) return null;
  const valid = (k: AnticipationCandle) => [k.o, k.c, k.h, k.l].every(x => Number.isFinite(x) && x > 0)
    && k.h >= Math.max(k.o, k.c) && k.l <= Math.min(k.o, k.c) && k.h >= k.l;
  const closed = new Map(raw.filter(k => k.t < minute).map(k => [k.t, k]));
  const history: AnticipationCandle[] = [];
  for (let n = 100; n > 0; n--) {
    const bar = closed.get(minute - n * 60);
    if (!bar || !valid(bar)) return null;
    history.push(bar);
  }
  const current = raw.find(k => k.t === minute);
  if (!current || !valid(current)) return null;
  const meanBody = history.slice(-20).reduce((sum, k) => sum + Math.abs(k.c - k.o), 0) / 20;
  const body = Math.abs(current.c - current.o);
  if (!(meanBody > 0 && body > 2 * meanBody)) return null;
  const direction = current.c > current.o ? 'CALL' : 'PUT';
  return {
    signal_id: `${FORCE_FORMING_PREFIX}${asset}-${minute}`, asset, direction,
    entry_minute: new Date(minute * 1000).toISOString(), created_at: new Date(now * 1000).toISOString(),
    expiration_time: new Date((minute + 60) * 1000).toISOString(), entry_price: current.c,
    result: 'open', profit: 0,
    indicators: { strategy: FORCE_FORMING_STRATEGY, ruleVersion: 1, mode: 'TEST_ONLY',
      observedAt: new Date(now * 1000).toISOString(), elapsedSeconds: now - minute,
      referenceMeanBody: meanBody, observedBodyRatio: body / meanBody,
      expectedForceSignalMinute: new Date((minute + 60) * 1000).toISOString(),
      forceConfirmed: null, simulatedStake: 10, simulatedPayout: 0.85 },
  };
}

export function forceFormingConfirmation(indicators: Record<string, unknown>, direction: string, candle: AnticipationCandle) {
  const mean = Number(indicators.referenceMeanBody);
  const ratio = mean > 0 ? Math.abs(candle.c - candle.o) / mean : 0;
  return { ...indicators, closedBodyRatio: ratio,
    forceConfirmed: ratio > 2 && (candle.c > candle.o ? 'CALL' : 'PUT') === direction };
}