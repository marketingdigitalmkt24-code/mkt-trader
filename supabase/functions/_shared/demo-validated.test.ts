import { test, expect, describe, it } from 'bun:test';
import { isDemoValidatedPrincipal, DEMO_VALIDATED_PRINCIPAL, DEMO_PRINCIPAL_ENABLED, isSuperSelected } from './demo-validated';

describe('isDemoValidatedPrincipal', () => {
  it('blocks everything while real principal entries are paused', () => {
    expect(DEMO_PRINCIPAL_ENABLED).toBe(false);
    for (const s of [...DEMO_VALIDATED_PRINCIPAL, 'RETOMADA', 'REVERSAO_RSI', 'VELA_FORCA', 'FORCA_ANTECIPADA',
      'TENDENCIA_3_LOSS_PUT', 'ICHIMOKU_FORCA', 'KDJ_RSI', 'TENDENCIA', 'COPY_TRADE', 'CONTINUACAO_QUEDA_V1']) {
      expect(isDemoValidatedPrincipal(s)).toBe(false);
    }
    expect(isDemoValidatedPrincipal(undefined)).toBe(false);
    expect(isDemoValidatedPrincipal(null)).toBe(false);
    expect(isDemoValidatedPrincipal('')).toBe(false);
  });
});
describe('isSuperSelected', () => {
 it('additionally accepts displayed score exactly 2.26, not a new minimum', () => {
  for (const score of [2.26, 2.255, 2.2599, 2.2649]) expect(isSuperSelected(score)).toBe(true);
  for (const score of [2.25, 2.2549, 2.265, 2.27, 2.5, 3.7, Infinity, -Infinity]) expect(isSuperSelected(score)).toBe(false);
 });
 it('accepts only the 4.0-4.5 band and rejects inflated scores', () => {
  expect(isSuperSelected(4.0)).toBe(true);
  expect(isSuperSelected(4.49)).toBe(true);
  expect(isSuperSelected(4.5)).toBe(false);
  expect(isSuperSelected(5.2)).toBe(false);
  expect(isSuperSelected(6.12)).toBe(false);
  expect(isSuperSelected(3.99)).toBe(false);
  expect(isSuperSelected(0)).toBe(false);
  expect(isSuperSelected(undefined)).toBe(false);
  expect(isSuperSelected(null)).toBe(false);
  expect(isSuperSelected(NaN)).toBe(false);
 });
});
