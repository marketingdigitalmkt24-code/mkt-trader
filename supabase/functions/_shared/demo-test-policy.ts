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
export { demoBalance } from './demo-balance.ts';
export function freshDemoCandidate(row: { signal_id: string; timeframe: string; created_at: string; direction: string; entry_strategy?: string }, now: number) {
 if (row.signal_id.startsWith('t7-')) return freshDemoTest(row,now);
 const at = Date.parse(row.created_at);
 const known = (row.signal_id.startsWith('demo-tendencia-alinhada-v1-') && row.entry_strategy === 'TENDENCIA_ALINHADA' && ['CALL','PUT'].includes(row.direction) && at % 300000 === 0)
  || (row.signal_id.startsWith('demo-queda-forte-v1-') && row.entry_strategy === 'QUEDA_FORTE' && ['CALL','PUT'].includes(row.direction) && at % 300000 === 0)
  || (row.signal_id.startsWith('demo-continuation-v1-') && row.entry_strategy === 'CONTINUACAO_QUEDA_V1' && row.direction === 'PUT')
  || (row.signal_id.startsWith('demo-teto-v1-') && row.entry_strategy === 'TETO_V1' && row.direction === 'PUT')
   || (row.signal_id.startsWith('queda-win-call-v1-') && row.entry_strategy === 'QUEDA_WIN_CALL_V1' && row.direction === 'CALL')
   || (row.signal_id.startsWith('queda-win-retry-v1-') && row.entry_strategy === 'QUEDA_WIN_RETRY_V1' && row.direction === 'CALL')
    || (row.signal_id.startsWith('forca-padrao-v1-') && row.entry_strategy === 'FORCA_PADRAO_V1' && ['CALL','PUT'].includes(row.direction))
    || (row.signal_id.startsWith('forca-antecipada-v1-') && row.entry_strategy === 'FORCA_ANTECIPADA_V1' && ['CALL','PUT'].includes(row.direction))
    || (row.signal_id.startsWith('takashi-bnf-v1-') && row.entry_strategy === 'TAKASHI_BNF_V1' && ['CALL','PUT'].includes(row.direction))
    || (row.signal_id.startsWith('demo-ichimoku-recuo21-v1-') && row.entry_strategy === 'ICHIMOKU_RECUO21' && ['CALL','PUT'].includes(row.direction))
    || (row.signal_id.startsWith('demo-ichimoku-v1-') && row.entry_strategy === 'ICHIMOKU' && ['CALL','PUT'].includes(row.direction))
    || (row.signal_id.startsWith('demo-recuo_ema21-v1-') && row.entry_strategy === 'RECUO_EMA21' && ['CALL','PUT'].includes(row.direction))
    || (row.signal_id.startsWith('demo-tendencia-forca-recuo-v1-') && row.entry_strategy === 'TENDENCIA_FORCA_RECUO' && ['CALL','PUT'].includes(row.direction))
    || (row.signal_id.startsWith('demo-confluencia4-v1-') && row.entry_strategy === 'CONFLUENCIA_4_ESTRATEGIAS' && ['CALL','PUT'].includes(row.direction))
    || (row.signal_id.startsWith('demo-padrao-vencedor-v1-') && row.entry_strategy === 'PADRAO_VENCEDOR' && ['CALL','PUT'].includes(row.direction))
    || (['TENDENCIA','VELA_FORCA','ROMPIMENTO','REVERSAO_RSI','KDJ'].includes(row.entry_strategy ?? '')
      && row.signal_id.startsWith(`demo-${String(row.entry_strategy).toLowerCase()}-v1-`) && ['CALL','PUT'].includes(row.direction));
 return known && row.timeframe === 'TEST' && Number.isFinite(at)
  && at % 60000 === 0 && now >= at && now-at <= 25000;
}
