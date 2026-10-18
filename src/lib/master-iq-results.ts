import { afterIQReset } from './iq-results-reset';
import { clientDayStart } from './client-copy-results';

export interface MasterIQOperation {
  id: string; signal_id: string; asset: string; direction: string; result: string;
  profit: number; created_at: string; timeframe: string;
  entry_strategy: string | null; iq_option_id: string | null;
}

export function isMasterIQOrder(row: Pick<MasterIQOperation, 'signal_id' | 'timeframe' | 'iq_option_id' | 'created_at'> & { entry_strategy?: string | null }, cutoff = '') {
  return !row.signal_id.startsWith('copy-') && !row.signal_id.startsWith('mt5-')
    && row.entry_strategy !== 'FORCE_LOSS_WIN' && !row.signal_id.startsWith('force-lw-')
    && !['TEST', 'MT5'].includes(row.timeframe) && Boolean(row.iq_option_id)
    && !row.iq_option_id?.toLowerCase().startsWith('test') && afterIQReset(row.created_at, cutoff);
}

export function masterIQDailyStats(rows: MasterIQOperation[], cutoff = '', now = new Date()) {
  const operations = rows.filter(row => isMasterIQOrder(row, cutoff)
    && row.created_at >= clientDayStart(now) && row.created_at <= now.toISOString())
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  let wins = 0, losses = 0, dailyProfit = 0, todayTrades = 0, consecutiveLosses = 0, streak = 0;
  for (const row of operations) {
    const result = row.result.toLowerCase();
    if (!['win', 'loss', 'loose', 'tie', 'draw', 'equal'].includes(result)) continue;
    todayTrades++;
    dailyProfit += Number(row.profit || 0);
    if (result === 'win') { wins++; streak = 0; }
    else if (['loss', 'loose'].includes(result)) { losses++; streak++; consecutiveLosses = Math.max(consecutiveLosses, streak); }
    else streak = 0;
  }
  return { wins, losses, dailyProfit, todayTrades, consecutiveLosses };
}