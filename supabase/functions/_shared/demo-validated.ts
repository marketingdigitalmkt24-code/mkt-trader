// Principal IQ entries restricted to strategies validated by a selected Demo operation (user, Oct 24 2026):
// only orders derived from a "Últimas operações · Demo" winner may open real entries, even if rare.
// Oct 24 2026 05:24 UTC: user paused ALL real principal entries — Tendência invertida and Queda win +1
// are Demo-only until the Demo emits a "super selected" high-confidence operation. Flip to re-enable.
export const DEMO_PRINCIPAL_ENABLED = false;
export const DEMO_VALIDATED_PRINCIPAL = ['TENDENCIA_WIN_INVERTIDA', 'QUEDA_WIN_RETRY_V1'];
export function isDemoValidatedPrincipal(strategy: string | undefined | null): boolean {
  return DEMO_PRINCIPAL_ENABLED && !!strategy && DEMO_VALIDATED_PRINCIPAL.includes(strategy);
}
// Only a selected Demo candidate whose displayed score is exactly the configured value
// authorizes principal IQ + Telegram + copy (user, Oct 24 2026 20:56 UTC: 4.0–4.5 band retired).
export const SUPER_SELECIONADA = 'SUPER_SELECIONADA';
export const SUPER_SELECTED_EXACT_SCORE = 2.26;
export function isSuperSelected(score: number | undefined | null): boolean {
  return typeof score === 'number' && Number.isFinite(score)
    && Math.round(score * 100) === Math.round(SUPER_SELECTED_EXACT_SCORE * 100);
}
