import { isNormalPrincipalTrend } from './normal-trend';

export interface CopyResultRow {
  signal_id: string;
  result: string;
  iq_option_id: string | null;
  timeframe: string;
  profit?: number;
  entry_strategy?: string | null;
}

export function copyResultRates(wins: number, losses: number) {
  const total = wins + losses;
  return { winPercent: total ? wins / total * 100 : 0, lossPercent: total ? losses / total * 100 : 0 };
}

export function countClientCopyResults(rows: CopyResultRow[], userId: string) {
  const own = rows.filter(row => row.signal_id.startsWith(`copy-${userId}-`)
    && !isNormalPrincipalTrend(row)
    && row.entry_strategy !== 'FORCE_LOSS_WIN' && !row.signal_id.includes('-force-lw-')
    && row.entry_strategy !== 'FORCA_INVERTIDA' && !row.signal_id.includes('-forca_invertida-')
    && Boolean(row.iq_option_id) && !['TEST', 'MT5'].includes(row.timeframe));
  return {
    wins: own.filter(row => row.result === 'win').length,
    losses: own.filter(row => row.result === 'loss').length,
    profit: own.filter(row => ['win', 'loss', 'draw', 'tie'].includes(row.result))
      .reduce((sum, row) => sum + (Number.isFinite(row.profit) ? Number(row.profit) : 0), 0),
  };
}