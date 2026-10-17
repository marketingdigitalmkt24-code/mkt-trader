export interface CopyResultRow {
  signal_id: string;
  result: string;
  iq_option_id: string | null;
  timeframe: string;
}

export function countClientCopyResults(rows: CopyResultRow[], userId: string) {
  const own = rows.filter(row => row.signal_id.startsWith(`copy-${userId}-`)
    && Boolean(row.iq_option_id) && !['TEST', 'MT5'].includes(row.timeframe));
  return {
    wins: own.filter(row => row.result === 'win').length,
    losses: own.filter(row => row.result === 'loss').length,
  };
}