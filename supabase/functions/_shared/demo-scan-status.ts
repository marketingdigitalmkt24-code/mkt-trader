export type DemoAssetAnalysis = {
  asset: string;
  direction: 'CALL' | 'PUT' | null;
  score: number | null;
  state: 'no_signal' | 'incomplete_candles' | 'eligible' | 'market_unavailable';
};
export type DemoScanStatus = {
  target_minute: string;
  observed_at: string;
  phase: 'preparing' | 'scanning' | 'completed' | 'unavailable';
  assets: number;
  selected_signal: string | null;
  error_code: string | null;
  asset_analyses?: DemoAssetAnalysis[];
};
export const DEMO_SCAN_BUCKET = 'demo-scan-telemetry';
export const DEMO_LAST_ANALYSIS = 'last-analysis.json';
export function demoScanSlot(target: number) { return `minute-${Math.floor(target / 60000) % 3}.json`; }
export function scanIsActive(status: DemoScanStatus | null, now: number) {
  if (!status || status.phase === 'unavailable') return false;
  const age = now - Date.parse(status.observed_at);
  return Number.isFinite(age) && age >= 0 && age < 120000;
}
export function latestDemoScan(rows: DemoScanStatus[]) {
  return rows.filter(row => Number.isFinite(Date.parse(row.target_minute)) && Number.isFinite(Date.parse(row.observed_at)))
    .sort((a,b) => Date.parse(b.target_minute) - Date.parse(a.target_minute) || Date.parse(b.observed_at) - Date.parse(a.observed_at))[0] ?? null;
}