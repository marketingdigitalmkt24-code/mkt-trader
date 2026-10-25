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
export { demoBalance } from '../_shared/demo-balance.ts';
export function freshDemoCandidate(row: { signal_id: string; timeframe: string; created_at: string; direction: string; entry_strategy?: string }, now: number) {
 if (row.signal_id.startsWith('t7-')) return freshDemoTest(row,now);
 const at = Date.parse(row.created_at);
 const known = (row.signal_id.startsWith('demo-continuation-v1-') && row.entry_strategy === 'CONTINUACAO_QUEDA_V1' && row.direction === 'PUT')
  || (row.signal_id.startsWith('demo-teto-v1-') && row.entry_strategy === 'TETO_V1' && row.direction === 'PUT')
   || (row.signal_id.startsWith('queda-win-call-v1-') && row.entry_strategy === 'QUEDA_WIN_CALL_V1' && row.direction === 'CALL')
   || (row.signal_id.startsWith('queda-win-retry-v1-') && row.entry_strategy === 'QUEDA_WIN_RETRY_V1' && row.direction === 'CALL')
    || (row.signal_id.startsWith('forca-padrao-v1-') && row.entry_strategy === 'FORCA_PADRAO_V1' && ['CALL','PUT'].includes(row.direction))
    || (row.signal_id.startsWith('takashi-bnf-v1-') && row.entry_strategy === 'TAKASHI_BNF_V1' && ['CALL','PUT'].includes(row.direction));
 return known && row.timeframe === 'TEST' && Number.isFinite(at)
  && at % 60000 === 0 && now >= at && now-at <= 25000;
}
