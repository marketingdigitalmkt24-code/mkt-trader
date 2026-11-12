import { test, expect } from 'bun:test';
import { demo226Authorized } from './demo-226-policy';

test('Takashi is never authorized by the 2.26 score', () => {
  expect(demo226Authorized(2.26, 'TAKASHI_BNF_V1')).toBe(false);
  expect(demo226Authorized(2.259, 'TAKASHI_BNF_V1')).toBe(false);
});

test('Force and Trend remain authorized; other strategies cannot use 2.26', () => {
  expect(demo226Authorized(2.26, 'VELA_FORCA')).toBe(true);
  expect(demo226Authorized(2.26, 'TENDENCIA')).toBe(true);
  expect(demo226Authorized(2.254, 'TENDENCIA')).toBe(false);
  expect(demo226Authorized(2.26, 'REVERSAO_RSI')).toBe(false);
});

import { demoAlternationAuthorized, preferredDemoCohort, demoCohort, takashiDemoAuthorized, TAKASHI_DEMO_MIN_SCORE } from './demo-226-policy';
test('Takashi no longer enters the Demo (user, Nov 3 2026)', () => {
  for (const score of [0, 4, 9]) expect(demoAlternationAuthorized(score, 'TAKASHI_BNF_V1')).toBe(false);
  expect(demoCohort(4.5, 'TAKASHI_BNF_V1')).toBeNull();
});
test('Demo rejects retired strategies regardless of score', () => {
  for (const strategy of ['FORCA_ANTECIPADA_V1','PADRAO_MEIO_V1','TETO_V1'])
    for (const score of [0,2.26,5]) expect(demoAlternationAuthorized(score,strategy)).toBe(false);
});
test('Demo always prefers Takashi', () => {
  expect(preferredDemoCohort('TAKASHI_BNF_V1')).toBe('takashi');
  expect(preferredDemoCohort('VELA_FORCA')).toBe('takashi');
  expect(preferredDemoCohort('FORCA_ANTECIPADA_V1')).toBe('takashi');
});
test('only aligned trend and Tendência + Força + Recuo authorize new Demo entries, without notes', () => {
  for (const strategy of ['TENDENCIA_ALINHADA','TENDENCIA_FORCA_RECUO'])
    for (const score of [undefined, Number.NaN, 0, 99]) expect(demoCohort(score,strategy)).toBe('indicator');
  for (const strategy of ['QUEDA_FORTE','ICHIMOKU_RECUO21','ICHIMOKU','RECUO_EMA21','CONFLUENCIA_4_ESTRATEGIAS','PADRAO_VENCEDOR','TENDENCIA'])
    expect(demoAlternationAuthorized(99,strategy)).toBe(false);
});
