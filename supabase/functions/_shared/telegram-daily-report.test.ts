import { expect, test } from 'bun:test';
import { bestReportStrategies, dailyReportStats, reportClock, type ReportRow } from './telegram-daily-report';
const now = new Date('2026-10-18T02:59:00.000Z');
const row = (extra: Partial<ReportRow> = {}): ReportRow => ({ signal_id: 'fourwin-1', timeframe: 'M1', iq_option_id: '123', result: 'loss', profit: -10, created_at: '2026-10-17T15:00:00.000Z', entry_strategy: 'FOUR_WIN_REVERSAL', test_sequence_strategy: null, ...extra });
test('retired strategy is absent from ranking but executed losses remain in daily accounting', () => {
  const removed = row({ entry_strategy: 'FORCE_LOSS_WIN' });
  expect(bestReportStrategies([removed], now)).toEqual([]);
  expect(dailyReportStats([removed], now).profit).toBe(-10);
});
test('due only at 23:59 BRT across UTC midnight', () => {
  expect(reportClock(now)).toMatchObject({ due: true, date: '2026-10-17', start: '2026-10-17T03:00:00.000Z' });
  expect(reportClock(new Date('2026-10-18T02:58:59Z')).due).toBe(false);
  expect(reportClock(new Date('2026-10-18T03:00:00Z')).due).toBe(false);
});
test('principal daily profit excludes copies TEST MT5 unconfirmed old and pending profit', () => {
  expect(dailyReportStats([row(), row({ result: 'win', profit: 8.5 }), row({ result: 'tie', profit: 0 }), row({ signal_id: 'copy-user-1', result: 'win', profit: 82 }), row({ timeframe: 'TEST', profit: 100 }), row({ timeframe: 'MT5', profit: 100 }), row({ iq_option_id: null, profit: 100 }), row({ created_at: '2026-10-17T02:59:00Z', profit: 100 }), row({ result: 'pending', profit: 100 })], now)).toEqual({ wins: 1, losses: 1, ties: 1, pending: 1, profit: -1.5, winRate: 50 });
});
test('top five use daily acerto then sample size excluding copies and other BRT days', () => {
  const rows = [row({ entry_strategy: 'A', result: 'win', created_at: '2026-09-01T03:00:00Z' }), row({ entry_strategy: 'B', result: 'win' }), row({ entry_strategy: 'B', result: 'win' }), row({ entry_strategy: 'C', result: 'win' }), row({ entry_strategy: 'C', result: 'loss' }), row({ entry_strategy: 'D', result: 'loss' }), row({ signal_id: 'copy-user-1', entry_strategy: 'COPY', result: 'win' })];
  rows.push(...['E', 'F', 'G', 'H'].map(entry_strategy => row({ entry_strategy, result: 'loss' })));
  rows.push(row({ entry_strategy: 'FUTURE', result: 'win', created_at: '2026-10-18T03:00:00Z' }));
  expect(bestReportStrategies(rows, now).map(s => s.strategy)).toEqual(['B', 'C', 'D', 'E', 'F']);
  expect(bestReportStrategies(rows, now)[0]).toEqual({ strategy: 'B', wins: 2, losses: 0 });
  expect(bestReportStrategies(rows, now)[1]).toEqual({ strategy: 'C', wins: 1, losses: 1 });
});
test('Retomada counts once alongside base strategy', () => {
  expect(bestReportStrategies([row({ timeframe: 'TEST', entry_strategy: 'TENDENCIA', result: 'win', test_sequence_strategy: 'TREND_WIN_LOSS_FORCE_LOSS' })], now)).toEqual([{ strategy: 'TENDENCIA', wins: 1, losses: 0 }, { strategy: 'TREND_WIN_LOSS_FORCE_LOSS', wins: 1, losses: 0 }]);
});
test('daily inverted Force counts opposite wins and losses only on marked TEST rows', () => {
  const rows = ['loss', 'loss', 'win'].map(result => row({ timeframe: 'TEST', entry_strategy: 'VELA_FORCA', test_inverted_strategy: 'FORCA_INVERTIDA', result }));
  rows.push(row({ timeframe: 'TEST', entry_strategy: 'VELA_FORCA', test_inverted_strategy: 'FORCA_INVERTIDA', result: 'loss', created_at: '2026-10-17T02:59:59Z' }));
  expect(bestReportStrategies(rows, now).find(s => s.strategy === 'FORCA_INVERTIDA')).toEqual({ strategy: 'FORCA_INVERTIDA', wins: 2, losses: 1 });
});
