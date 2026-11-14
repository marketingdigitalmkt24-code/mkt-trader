import { closedDemoAnalysisWindow, demoEma } from './demo-signal-quality.ts';
export const AI_BREAKOUT = 'IA_ROMPIMENTO_M1';
export const AI_PULLBACK = 'IA_RECUO_M1';
export const AI_CHART_STRATEGIES = [AI_BREAKOUT, AI_PULLBACK] as const;
export const CHART_ONLY_VERSION = 'demo-chart-only-preboundary-v3';
// Legacy strategy IDs retain exact historical joins; selection now uses only chart evidence.
export function selectChartCandidate<T extends { entry_strategy: string; quality: number; asset: string; signal_id: string }>(candidates: T[], strategy: string, account: unknown): T | null {
  if (account !== 'PRACTICE' || !AI_CHART_STRATEGIES.some(s => s === strategy)) return null;
  return candidates.filter(c => c.entry_strategy === strategy && Number.isFinite(c.quality))
    .sort((a,b) => b.quality - a.quality || a.asset.localeCompare(b.asset) || a.signal_id.localeCompare(b.signal_id))[0] ?? null;
}
export const AI_CHART_PREFIXES: Record<string, string> = {
  [AI_BREAKOUT]: 'demo-ia-rompimento-v1', [AI_PULLBACK]: 'demo-ia-recuo-v1',
};
export type AiChartCandle = { t: number; o: number; h: number; l: number; c: number; v?: number };
export function aiChartSetups(candles: AiChartCandle[], entrySec: number) {
  const closed = closedDemoAnalysisWindow(candles, entrySec);
  if (!closed) return [];
  const last = closed.at(-1);
  if (!last) return [];
  const prices = closed.map(c => c.c);
  const fast = demoEma(9, prices).at(-1) ?? 0;
  const slowSeries = demoEma(21, prices), longSeries = demoEma(50, prices);
  const slow = slowSeries.at(-1) ?? 0, priorSlow = slowSeries.at(-2) ?? 0;
  const long = longSeries.at(-1) ?? 0, priorLong = longSeries.at(-2) ?? 0;
  const direction: 'CALL' | 'PUT' | null = fast > slow && slow > long && slow > priorSlow && long > priorLong && last.c > last.o ? 'CALL'
    : fast < slow && slow < long && slow < priorSlow && long < priorLong && last.c < last.o ? 'PUT' : null;
  if (!direction) return [];
  const prior = closed.slice(-21, -1);
  const range = prior.reduce((sum, c) => sum + c.h - c.l, 0) / prior.length;
  if (!(range > 0) || range / last.c < 0.00002) return [];
  const high = Math.max(...prior.map(c => c.h)), low = Math.min(...prior.map(c => c.l));
  const breakout = direction === 'CALL' ? last.c > high : last.c < low;
  const pullback = direction === 'CALL' ? last.l <= slow && last.c > slow : last.h >= slow && last.c < slow;
  return [breakout ? AI_BREAKOUT : null, pullback ? AI_PULLBACK : null]
    .flatMap(strategy => strategy ? [{ strategy, direction, closed, fast, slow }] : []);
}
export function aiChartPracticeOnly(account: unknown) { return account === 'PRACTICE'; }
export function aiChartTimely(entryMs: number, now: number) { return now >= entryMs && now - entryMs <= 25_000; }