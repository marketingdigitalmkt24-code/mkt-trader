import { countClientCopyResults, isClientCopyResult, type CopyResultRow } from './admin-copy-results';
import { afterIQReset } from './iq-results-reset';

export interface ClientDailyRow extends CopyResultRow {
  id: string;
  created_at: string;
}

export function clientDailyHistory(rows: ClientDailyRow[], userId: string, cutoff = '', now = new Date()) {
  const grouped = new Map<string, ClientDailyRow[]>();
  const seen = new Set<string>();
  for (const row of rows) {
    if (seen.has(row.id) || !isClientCopyResult(row, userId)
      || !['win', 'loss', 'draw', 'tie'].includes(row.result)
      || !/^\d+$/.test(row.iq_option_id ?? '') || row.created_at > now.toISOString()
      || !afterIQReset(row.created_at, cutoff)) continue;
    seen.add(row.id);
    const date = new Date(Date.parse(row.created_at) - 3 * 3600000).toISOString().slice(0, 10);
    grouped.set(date, [...(grouped.get(date) ?? []), row]);
  }
  return [...grouped.entries()].map(([date, dayRows]) => {
    const totals = countClientCopyResults(dayRows, userId);
    return { date, ...totals, trades: dayRows.length, ties: dayRows.filter(row => ['draw', 'tie'].includes(row.result)).length };
  }).sort((a, b) => b.date.localeCompare(a.date));
}

export function clientDailyPage<T>(days: T[], requestedPage: number) {
  const pageSize = 5;
  const totalPages = Math.max(1, Math.ceil(days.length / pageSize));
  const page = Math.max(0, Math.min(requestedPage, totalPages - 1));
  return { page, totalPages, days: days.slice(page * pageSize, (page + 1) * pageSize) };
}