import { test, expect, describe, it } from 'bun:test';
import { isDemoValidatedPrincipal, DEMO_VALIDATED_PRINCIPAL, DEMO_PRINCIPAL_ENABLED } from './demo-validated';

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
