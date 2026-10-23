import type { AnticipationCandle } from './force-anticipation-test.ts';
import { iqMarketOpen, type IQMarketAsset } from './iq-market-open.ts';

export type StrategyFire = [string, 'CALL' | 'PUT'];
export const COMPARISON_PREFIX = 'combo-test-v1-';
const components = ['ICHIMOKU', 'VELA_FORCA', 'KDJ', 'REVERSAO_RSI'];
export function combinedStrategies(fired: StrategyFire[]): StrategyFire[] {
  const output: StrategyFire[] = [];
  for (const direction of ['CALL', 'PUT'] as const) {
    const has = (strategy: string) => fired.some(([s, d]) => s === strategy && d === direction);
    if (has('ICHIMOKU') && has('VELA_FORCA')) output.push(['TEST_ICHIMOKU_FORCA_V1', direction]);
    if (has('KDJ') && has('REVERSAO_RSI')) output.push(['TEST_KDJ_RSI_V1', direction]);
  }
  return output;
}

// Independent prospective cohort: no operation_results, ranking, claim, copy or Telegram.
export function combinedTestObservations(asset: string, candles: AnticipationCandle[], fired: StrategyFire[],
  minute: number, now: number, markets: IQMarketAsset[]) {
  if (now < minute || now - minute > 30 || minute % 60 !== 0
    || !markets.some(m => iqMarketOpen(m, now, minute + 60))) return [];
  const quote = candles.find(c => c.t === minute);
  if (!quote || !Number.isFinite(quote.c) || quote.c <= 0) return [];
  for (let n = 1; n <= 81; n++) {
    const bar = candles.find(c => c.t === minute - n * 60);
    if (!bar || ![bar.o, bar.c, bar.h, bar.l].every(v => Number.isFinite(v) && v > 0)) return [];
  }
  const references = fired.filter(([s]) => components.includes(s)).map(([s,d]) => [`REF_${s}_V1`,d] as StrategyFire);
  return [...combinedStrategies(fired), ...references].map(([strategy, direction]) => ({
    signal_id: `${COMPARISON_PREFIX}${strategy}-${asset}-${minute}-${direction}`,
    asset, direction, entry_minute: new Date(minute * 1000).toISOString(),
    created_at: new Date(now * 1000).toISOString(), expiration_time: new Date((minute + 60) * 1000).toISOString(),
    entry_price: quote.c, result: 'open', profit: 0,
    indicators: { strategy, mode: 'TEST_ONLY', ruleVersion: 1,
      observedAt: new Date(now * 1000).toISOString(), sourceMinute: new Date((minute - 60) * 1000).toISOString(),
      signals: fired.map(([s,d]) => ({strategy:s,direction:d})), simulatedStake:10, simulatedPayout:0.85 },
  }));
}