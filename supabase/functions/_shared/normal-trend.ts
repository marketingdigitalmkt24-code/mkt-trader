// Only the normal principal Trend is retired; Demo triggers and derived strategies remain active.
export function isNormalPrincipalTrend(row: { signal_id: string; entry_strategy?: string | null }) {
  if (row.entry_strategy) return row.entry_strategy === 'TENDENCIA';
  return /(?:^|-)tendencia-demo-v1-/.test(row.signal_id)
    || (!/tendencia_win_invertida-|tendencia_3_loss_put-/.test(row.signal_id)
      && /(?:^|-)t7-.+-TENDENCIA-/.test(row.signal_id));
}