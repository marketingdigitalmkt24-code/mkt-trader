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
 it('accepts only scores at or above the 4.0 threshold', () => {
  expect(isSuperSelected(4.0)).toBe(true);
  expect(isSuperSelected(5.2)).toBe(true);
  expect(isSuperSelected(3.99)).toBe(false);
  expect(isSuperSelected(0)).toBe(false);
  expect(isSuperSelected(undefined)).toBe(false);
  expect(isSuperSelected(null)).toBe(false);
  expect(isSuperSelected(NaN)).toBe(false);
 });
});
