import { expect, test } from 'bun:test';
import { clientDailyHistory, clientDailyPage, type ClientDailyRow } from '../src/lib/client-daily-history';

const row = (id: string, created_at: string, patch: Partial<ClientDailyRow> = {}): ClientDailyRow => ({
  id, created_at, signal_id: `copy-client-${id}`, result: 'win', profit: 8.2, iq_option_id: id,
  timeframe: 'M1', entry_strategy: 'NOTA_CONSISTENTE', ...patch,
});
const now = new Date('2026-10-30T12:00:00Z');
test('history has five result days per page and preserves older pages', () => {
  const rows = Array.from({ length: 12 }, (_, i) => row(String(i + 1), `2026-10-${String(30 - i).padStart(2, '0')}T04:00:00Z`));
  const days = clientDailyHistory(rows, 'client', '', now);
  expect(clientDailyPage(days, 0).days.map(d => d.date)).toEqual(['2026-10-30', '2026-10-29', '2026-10-28', '2026-10-27', '2026-10-26']);
  expect(clientDailyPage(days, 1).days.map(d => d.date)).toEqual(['2026-10-25', '2026-10-24', '2026-10-23', '2026-10-22', '2026-10-21']);
  expect(clientDailyPage(days, 2).days).toHaveLength(2);
  expect(clientDailyPage(days, 2).totalPages).toBe(3);
});
test('only confirmed own copies count; BRT day, net result and duplicate IDs are respected', () => {
  const own = row('1', '2026-10-30T02:59:00Z');
  const days = clientDailyHistory([own, own,
    row('2', '2026-10-30T03:00:00Z', { result: 'loss', profit: -10 }),
    row('3', '2026-10-30T03:00:00Z', { signal_id: 'copy-other-3' }),
    row('4', '2026-10-30T03:00:00Z', { timeframe: 'TEST' }),
    row('5', '2026-10-30T03:00:00Z', { iq_option_id: null }),
    row('6', '2026-10-30T03:00:00Z', { result: 'pending' }),
    row('7', '2026-10-30T03:00:00Z', { entry_strategy: 'FORCA_INVERTIDA' }),
  ], 'client', '', now);
  expect(days).toEqual([
    { date: '2026-10-30', wins: 0, losses: 1, profit: -10, trades: 1, ties: 0 },
    { date: '2026-10-29', wins: 1, losses: 0, profit: 8.2, trades: 1, ties: 0 },
  ]);
});
test('reset only hides the cutoff day through the cutoff, keeping earlier days and new trades', () => {
  const days = clientDailyHistory([
    row('1', '2026-10-29T12:00:00Z'), row('2', '2026-10-30T04:00:00Z'), row('3', '2026-10-30T06:00:00Z'),
  ], 'client', '2026-10-30T05:00:00Z', now);
  expect(days.map(d => [d.date, d.wins])).toEqual([['2026-10-30', 1], ['2026-10-29', 1]]);
});