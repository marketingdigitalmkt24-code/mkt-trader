// A scheduled runner prepares the next minute; immediate diagnostics stay in this minute.
export function demoTargetMinute(now: number, scheduled: boolean): number {
  return (Math.floor(now / 60000) + (scheduled ? 1 : 0)) * 60000;
}
export function demoCandleRequestTime(now: number, target: number): number | null {
  return now >= target && now < target + 30000 ? Math.floor(now / 1000) : null;
}