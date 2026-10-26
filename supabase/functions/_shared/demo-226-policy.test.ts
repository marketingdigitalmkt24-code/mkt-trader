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
test('Takashi only enters Demo with a learned score above 4 (user, Oct 26 2026)', () => {
  expect(demoAlternationAuthorized(4.01, 'TAKASHI_BNF_V1')).toBe(true);
  expect(demoAlternationAuthorized(4, 'TAKASHI_BNF_V1')).toBe(false);
  expect(demoAlternationAuthorized(3.99, 'TAKASHI_BNF_V1')).toBe(false);
  expect(demoCohort(4.5, 'TAKASHI_BNF_V1')).toBe('takashi');
  expect(demoCohort(TAKASHI_DEMO_MIN_SCORE, 'TAKASHI_BNF_V1')).toBeNull();
  expect(takashiDemoAuthorized(4.01)).toBe(true);
  expect(takashiDemoAuthorized(Number.NaN)).toBe(false);
});
test('Demo still accepts 2.26 Force/Trend beside the gated Takashi', () => {
  expect(demoAlternationAuthorized(2.26, 'TENDENCIA')).toBe(true);
  expect(demoAlternationAuthorized(2.3, 'TENDENCIA')).toBe(false);
});
test('Demo alternates after each slot', () => {
  expect(preferredDemoCohort('TAKASHI_BNF_V1')).toBe('score226');
  expect(preferredDemoCohort('VELA_FORCA')).toBe('antecipada');
  expect(preferredDemoCohort('FORCA_ANTECIPADA_V1')).toBe('takashi');
});
