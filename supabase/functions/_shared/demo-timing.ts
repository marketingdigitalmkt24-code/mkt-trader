// Demo: strategies analyze closed M5 candles, entries expire in 1 minute (user, Nov 12 2026).
export const DEMO_CANDLE_SEC = 60; // expiry
export const DEMO_ANALYSIS_SEC = 300; // analysis candle size
// Entries open only when a new M5 candle has just closed.
export const isDemoEntryBoundary = (targetMs: number) => Math.floor(targetMs / 1000) % DEMO_ANALYSIS_SEC === 0;
// A scheduled runner prepares the next minute; immediate diagnostics stay in this minute.
export function demoTargetMinute(now: number, scheduled: boolean): number {
  return (Math.floor(now / 60000) + (scheduled ? 1 : 0)) * 60000;
}
export function demoCandleRequestTime(now: number, target: number): number | null {
  return now >= target && now < target + 30000 ? Math.floor(now / 1000) : null;
}
// Fetch availability during preparation; only the candle request waits for :00.
export function demoBoundaryDelay(now: number, target: number): number {
  return Math.max(0, target - now);
}