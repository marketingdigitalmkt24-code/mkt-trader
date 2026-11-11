import { expect, test } from 'bun:test';
import { tendenciaForcaRecuoDirection } from './tendencia-forca-recuo.ts';
import { demoCohort } from './demo-226-policy.ts';
import { freshDemoCandidate } from './demo-test-policy.ts';

test('fires only when Tendência, Vela de força and Recuo agree on the same direction', () => {
  expect(tendenciaForcaRecuoDirection([['TENDENCIA', 'CALL'], ['VELA_FORCA', 'CALL'], ['RECUO_EMA21', 'CALL']])).toBe('CALL');
  expect(tendenciaForcaRecuoDirection([['TENDENCIA', 'PUT'], ['VELA_FORCA', 'PUT'], ['RECUO_EMA21', 'PUT'], ['KDJ', 'CALL']])).toBe('PUT');
});

test('missing or disagreeing part never fires', () => {
  expect(tendenciaForcaRecuoDirection([['TENDENCIA', 'CALL'], ['RECUO_EMA21', 'CALL']])).toBeNull();
  expect(tendenciaForcaRecuoDirection([['TENDENCIA', 'CALL'], ['VELA_FORCA', 'PUT'], ['RECUO_EMA21', 'CALL']])).toBeNull();
});

test('combined strategy is a Demo entry strategy with a fresh-candidate prefix', () => {
  expect(demoCohort(1.2, 'TENDENCIA_FORCA_RECUO')).toBeNull();
  const at = Date.UTC(2026, 10, 3, 3, 30);
  expect(freshDemoCandidate({ signal_id: `demo-tendencia-forca-recuo-v1-EUR/USD-${at / 1000}`, timeframe: 'TEST', created_at: new Date(at).toISOString(), direction: 'CALL', entry_strategy: 'TENDENCIA_FORCA_RECUO' }, at + 1000)).toBe(true);
});
