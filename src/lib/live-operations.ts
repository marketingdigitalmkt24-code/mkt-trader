// "Últimas operações" display starts empty at this moment; records and other totals stay intact.
export const LIVE_OPERATIONS_DISPLAY_CUTOFF = '2026-10-23T18:39:21.000Z';

export interface LiveOperationRow {
  signal_id: string;
  timeframe: string | null;
  iq_option_id: string | null;
  created_at: string;
  entry_strategy?: string | null;
}

export function isLiveBrokerOperation(row: LiveOperationRow) {
  return row.created_at >= LIVE_OPERATIONS_DISPLAY_CUTOFF
    && /^\d+$/.test(row.iq_option_id ?? '')
    && !['TEST', 'MT5'].includes(row.timeframe ?? '')
    && !/^(copy|mt5|sim|force-lw|forca_invertida)-/.test(row.signal_id)
    && !['FORCE_LOSS_WIN', 'FORCA_INVERTIDA'].includes(row.entry_strategy ?? '');
}