import { selectedDemoTrend } from './selected-demo-trend.ts';
export const TREND_WIN_INVERTED = 'TENDENCIA_WIN_INVERTIDA';
type TrendCandidate = { signal_id: string; entry_strategy: string; entry_minute: string; direction: string; asset: string };
type Outcome = { entry_strategy: string; entry_minute: string; result: string; status: string; iq_option_id: string | null };
export function trendWinInverted(candidate: TrendCandidate | null, outcomes: Outcome[], now: number) {
  if (!candidate || !selectedDemoTrend(candidate, now)) return null;
  const previous = new Date(Date.parse(candidate.entry_minute) - 60000).toISOString();
  if (!outcomes.some(o => o.entry_strategy === 'TENDENCIA' && o.entry_minute === previous
    && o.status === 'confirmed' && /^\d+$/.test(o.iq_option_id || '') && o.result === 'win')) return null;
  return { asset: candidate.asset, direction: candidate.direction === 'CALL' ? 'PUT' as const : 'CALL' as const,
    entry_strategy: TREND_WIN_INVERTED };
}