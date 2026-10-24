// Only the normal principal Trend is retired; Demo triggers and derived strategies remain active.
// Copies carry entry_strategy COPY_TRADE, so the signal_id pattern must be checked first.
export function isNormalPrincipalTrend(row: { signal_id: string; entry_strategy?: string | null }) {
  if (/(?:^|-)tendencia-demo-v1-/.test(row.signal_id)) return true;
  if (row.entry_strategy) return row.entry_strategy === 'TENDENCIA';
  return !/tendencia_win_invertida-|tendencia_3_loss_put-/.test(row.signal_id)
    && /(?:^|-)t7-.+-TENDENCIA-/.test(row.signal_id);
}
