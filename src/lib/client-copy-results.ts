import { countClientCopyResults, type CopyResultRow } from './admin-copy-results';

export interface ClientCopyOperation extends CopyResultRow {
  id: string;
  asset: string;
  direction: string;
  created_at: string;
  entry_strategy?: string | null;
}

export function clientSignalsPage<T>(operations: T[], requestedPage: number) {
  const pageSize = 12;
  const totalPages = Math.max(1, Math.ceil(operations.length / pageSize));
  const page = Math.min(Math.max(1, requestedPage), totalPages);
  return { page, totalPages, operations: operations.slice((page - 1) * pageSize, page * pageSize) };
}

export function clientDayStart(now = new Date()) {
  const brt = new Date(now.getTime() - 3 * 3600000);
  return new Date(Date.UTC(brt.getUTCFullYear(), brt.getUTCMonth(), brt.getUTCDate(), 3)).toISOString();
}

export function clientCopyResults(rows: ClientCopyOperation[], userId: string, now = new Date()) {
  const start = clientDayStart(now);
  const operations = rows.filter(row => row.signal_id.startsWith(`copy-${userId}-`)
    && row.entry_strategy !== 'FORCE_LOSS_WIN' && !row.signal_id.includes('-force-lw-')
    && Boolean(row.iq_option_id) && !['TEST', 'MT5'].includes(row.timeframe)
    && row.created_at >= start && row.created_at <= now.toISOString());
  const totals = countClientCopyResults(operations, userId);
  const trades = operations.filter(row => ['win', 'loss', 'draw', 'tie'].includes(row.result)).length;
  return { operations, ...totals, trades };
}