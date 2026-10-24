// Principal IQ entries restricted to strategies validated by a selected Demo operation (user, Oct 24 2026):
// only orders derived from a "Últimas operações · Demo" winner may open real entries, even if rare.
export const DEMO_VALIDATED_PRINCIPAL = ['TENDENCIA_WIN_INVERTIDA', 'QUEDA_WIN_RETRY_V1'];
export function isDemoValidatedPrincipal(strategy: string | undefined | null): boolean {
  return !!strategy && DEMO_VALIDATED_PRINCIPAL.includes(strategy);
}
