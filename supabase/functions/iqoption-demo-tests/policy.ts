export const DEMO_TEST_AMOUNT = 1;
export function validDemoTestAmount(value: unknown): value is number {
 return typeof value === 'number' && Number.isFinite(value) && value >= 1
  && Math.abs(value * 100 - Math.round(value * 100)) < 0.000001;
}
export function freshDemoTest(row: { signal_id: string; timeframe: string; created_at: string; direction: string }, now: number) {
  const at = Date.parse(row.created_at);
  return row.timeframe === 'TEST' && row.signal_id.startsWith('t7-')
    && ['CALL', 'PUT'].includes(row.direction) && Number.isFinite(at)
    && at % 60000 === 0 && now >= at && now - at <= 25000;
}
export function demoBalance(balances: { id: number; type: number; currency?: string }[]) {
  return balances.find(b => b.type === 4 && b.currency === 'USD' && Number.isFinite(b.id));
}
