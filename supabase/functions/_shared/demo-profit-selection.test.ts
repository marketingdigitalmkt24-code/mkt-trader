import { expect, test } from 'bun:test';
import { selectDemoByRotation, nextRotationOrder } from './demo-profit-selection.ts';
import { demoCohort } from './demo-226-policy.ts';

const c = (id: string, strategy: string, score = 2) => ({ signal_id: id, asset: id, direction: 'CALL', entry_strategy: strategy, created_at: '2026-11-03T03:50:00Z', _score: score });
test('retired strategies cannot win either Demo slot', () => {
  const retired=['QUEDA_FORTE','ICHIMOKU_RECUO21','ICHIMOKU','RECUO_EMA21','PADRAO_VENCEDOR','CONFLUENCIA_4_ESTRATEGIAS'];
  expect(selectDemoByRotation(retired.map(s=>c(s,s)),null)).toBeNull();
  expect(selectDemoByRotation([...retired.map(s=>c(s,s)),c('new','IA_ROMPIMENTO_M1')],null)?.signal_id).toBe('new');
  expect(selectDemoByRotation([...retired.map(s=>c(s,s)),c('new','IA_RECUO_M1')],null)?.signal_id).toBe('new');
});
test('aligned trend asset choice ignores notes and history',()=>{
  expect(selectDemoByRotation([c('z','IA_ROMPIMENTO_M1',99),c('a','IA_ROMPIMENTO_M1',Number.NaN)],'ICHIMOKU')?.signal_id).toBe('a');
});
