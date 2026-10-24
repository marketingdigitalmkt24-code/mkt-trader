// Principal IQ entries restricted to strategies validated by a selected Demo operation (user, Oct 24 2026):
// only orders derived from a "Últimas operações · Demo" winner may open real entries, even if rare.
// Oct 24 2026 05:24 UTC: user paused ALL real principal entries — Tendência invertida and Queda win +1
// are Demo-only until the Demo emits a "super selected" high-confidence operation. Flip to re-enable.
export const DEMO_PRINCIPAL_ENABLED = false;
export const DEMO_VALIDATED_PRINCIPAL = ['TENDENCIA_WIN_INVERTIDA', 'QUEDA_WIN_RETRY_V1'];
export function isDemoValidatedPrincipal(strategy: string | undefined | null): boolean {
  return DEMO_PRINCIPAL_ENABLED && !!strategy && DEMO_VALIDATED_PRINCIPAL.includes(strategy);
}
// Super-selected (user, Oct 24 2026): only Demo winners whose learned score lands inside the profitable band
// (>= 4.0 and < 4.5) open real IQ entries + Telegram. Scores above 4.5 come from small-sample bonuses and
// lost money in the history review, so they stay Demo-only (user, Oct 24 2026 05:45 UTC).
export const SUPER_SELECIONADA = 'SUPER_SELECIONADA';
export const SUPER_SELECTED_MIN_SCORE = 4.0;
export const SUPER_SELECTED_MAX_SCORE = 4.5;
export function isSuperSelected(score: number | undefined | null): boolean {
  return typeof score === 'number' && Number.isFinite(score)
    && score >= SUPER_SELECTED_MIN_SCORE && score < SUPER_SELECTED_MAX_SCORE;
}
