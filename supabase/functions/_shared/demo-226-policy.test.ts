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

import { demoAlternationAuthorized, preferredDemoCohort, demoCohort } from './demo-226-policy';
test('Demo accepts Takashi at any score and 2.26 Force/Trend', () => {
  expect(demoAlternationAuthorized(1.4, 'TAKASHI_BNF_V1')).toBe(true);
  expect(demoAlternationAuthorized(2.26, 'TENDENCIA')).toBe(true);
  expect(demoAlternationAuthorized(2.3, 'TENDENCIA')).toBe(false);
  expect(demoCohort(2.26, 'TAKASHI_BNF_V1')).toBe('takashi');
});
test('Demo alternates after each slot', () => {
  expect(preferredDemoCohort('TAKASHI_BNF_V1')).toBe('score226');
  expect(preferredDemoCohort('VELA_FORCA')).toBe('antecipada');
  expect(preferredDemoCohort('FORCA_ANTECIPADA_V1')).toBe('takashi');
});
