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
test('Takashi Demo accepts any finite score including zero and below four', () => {
  expect(demoAlternationAuthorized(4.01, 'TAKASHI_BNF_V1')).toBe(true);
  expect(demoAlternationAuthorized(4, 'TAKASHI_BNF_V1')).toBe(true);
  expect(demoAlternationAuthorized(3.99, 'TAKASHI_BNF_V1')).toBe(true);
  expect(demoAlternationAuthorized(0, 'TAKASHI_BNF_V1')).toBe(true);
  expect(demoCohort(4.5, 'TAKASHI_BNF_V1')).toBe('takashi');
  expect(demoCohort(TAKASHI_DEMO_MIN_SCORE, 'TAKASHI_BNF_V1')).toBe('takashi');
  expect(takashiDemoAuthorized(4.01)).toBe(true);
  expect(takashiDemoAuthorized(Number.NaN)).toBe(false);
});
test('Demo rejects strategies other than Takashi, Ichimoku and Recuo 21 regardless of score', () => {
  for (const strategy of ['TENDENCIA','VELA_FORCA','FORCA_ANTECIPADA_V1','PADRAO_MEIO_V1','REVERSAO_RSI'])
    for (const score of [0,2.26,5]) expect(demoAlternationAuthorized(score,strategy)).toBe(false);
});
test('Demo always prefers Takashi', () => {
  expect(preferredDemoCohort('TAKASHI_BNF_V1')).toBe('takashi');
  expect(preferredDemoCohort('VELA_FORCA')).toBe('takashi');
  expect(preferredDemoCohort('FORCA_ANTECIPADA_V1')).toBe('takashi');
});
test('Combined Ichimoku + Recuo 21 enters the Demo; separate strategies no longer do', () => {
  expect(demoCohort(0.4,'ICHIMOKU_RECUO21')).toBe('indicator');
  expect(demoAlternationAuthorized(Number.NaN,'ICHIMOKU_RECUO21')).toBe(false);
  for (const strategy of ['ICHIMOKU','RECUO_EMA21']) expect(demoAlternationAuthorized(3,strategy)).toBe(false);
});
