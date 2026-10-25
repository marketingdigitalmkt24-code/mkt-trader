import { test, expect } from 'bun:test';
import { demo226Authorized } from './demo-226-policy';

test('Takashi is authorized only with a calculated displayed score of 2.26', () => {
  expect(demo226Authorized(2.26032894533026, 'TAKASHI_BNF_V1')).toBe(true);
  expect(demo226Authorized(2.259, 'TAKASHI_BNF_V1')).toBe(true);
  expect(demo226Authorized(2.254, 'TAKASHI_BNF_V1')).toBe(false);
  expect(demo226Authorized(2.266, 'TAKASHI_BNF_V1')).toBe(false);
  expect(demo226Authorized(NaN, 'TAKASHI_BNF_V1')).toBe(false);
});

test('Force and Trend remain authorized; other strategies cannot use 2.26', () => {
  expect(demo226Authorized(2.26, 'VELA_FORCA')).toBe(true);
  expect(demo226Authorized(2.26, 'TENDENCIA')).toBe(true);
  expect(demo226Authorized(2.26, 'REVERSAO_RSI')).toBe(false);
  expect(demo226Authorized(2.26, 'FORCA_INVERTIDA')).toBe(false);
});