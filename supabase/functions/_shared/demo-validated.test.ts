import { test, expect, describe, it } from 'bun:test';
import { isDemoValidatedPrincipal, DEMO_VALIDATED_PRINCIPAL } from './demo-validated';

describe('isDemoValidatedPrincipal', () => {
  it('allows only Demo-validated strategies', () => {
    for (const s of DEMO_VALIDATED_PRINCIPAL) expect(isDemoValidatedPrincipal(s)).toBe(true);
    expect(isDemoValidatedPrincipal('TENDENCIA_WIN_INVERTIDA')).toBe(true);
    expect(isDemoValidatedPrincipal('QUEDA_WIN_RETRY_V1')).toBe(true);
  });
  it('blocks every direct-placement strategy', () => {
    for (const s of ['RETOMADA', 'REVERSAO_RSI', 'VELA_FORCA', 'FORCA_ANTECIPADA', 'TENDENCIA_3_LOSS_PUT',
      'ICHIMOKU_FORCA', 'KDJ_RSI', 'TENDENCIA', 'COPY_TRADE', 'CONTINUACAO_QUEDA_V1']) {
      expect(isDemoValidatedPrincipal(s)).toBe(false);
    }
    expect(isDemoValidatedPrincipal(undefined)).toBe(false);
    expect(isDemoValidatedPrincipal(null)).toBe(false);
    expect(isDemoValidatedPrincipal('')).toBe(false);
  });
});
