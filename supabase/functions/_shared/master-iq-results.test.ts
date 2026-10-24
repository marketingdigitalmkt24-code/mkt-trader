import { describe, expect, test } from 'bun:test';
import { isMasterIQOrder, masterIQDailyStats, type MasterIQOperation } from '../../../src/lib/master-iq-results';

const row = (extra: Partial<MasterIQOperation> = {}): MasterIQOperation => ({ id: '1', signal_id: 'fourwin-1', asset: 'JUP/USD-OTC', direction: 'CALL', result: 'loss', profit: -10, created_at: '2026-10-17T15:14:00.000Z', timeframe: 'M1', entry_strategy: 'FOUR_WIN_REVERSAL', iq_option_id: '14364506363', ...extra });
const now = new Date('2026-10-17T21:59:00.000Z');
describe('Principal IQ results', () => {
  test('new inverted Trend principal is visible and counted separately from copies', () => {
    const inverted = row({ signal_id: 'tendencia_win_invertida-v1-t7-new', entry_strategy: 'TENDENCIA_WIN_INVERTIDA', result: 'win', profit: 8.5 });
    expect(isMasterIQOrder(inverted)).toBe(true);
    expect(masterIQDailyStats([inverted, { ...inverted, signal_id: 'copy-client-'+inverted.signal_id }], '', now))
      .toMatchObject({ wins: 1, dailyProfit: 8.5, todayTrades: 1 });
  });
  test('removed Force LOSS WIN contributes neither trades nor displayed profit', () => {
    const removed = row({ entry_strategy: 'FORCE_LOSS_WIN', profit: 8.5, result: 'win' });
    expect(isMasterIQOrder(removed)).toBe(false);
    expect(isMasterIQOrder(row({ signal_id: 'force-lw-old', entry_strategy: null }))).toBe(false);
    expect(masterIQDailyStats([removed, row()], '', now)).toMatchObject({ wins: 0, losses: 1, dailyProfit: -10, todayTrades: 1 });
  });
  test('copy win of 82 never offsets principal loss of 10', () => {
    const stats = masterIQDailyStats([row(), row({ signal_id: 'copy-client-fourwin-1', profit: 82, result: 'win', iq_option_id: '14364506418' })], '', now);
    expect(stats).toMatchObject({ wins: 0, losses: 1, dailyProfit: -10, todayTrades: 1 });
  });
  test('TEST, MT5 and unconfirmed orders never count', () => {
    for (const extra of [{ timeframe: 'TEST' }, { timeframe: 'MT5' }, { signal_id: 'mt5-1' }, { iq_option_id: null }, { iq_option_id: 'test-1' }]) expect(isMasterIQOrder(row(extra))).toBe(false);
  });
  test('BRT midnight and browser cutoff are respected', () => {
    expect(masterIQDailyStats([row({ created_at: '2026-10-17T02:59:00.000Z' }), row()], '', now).dailyProfit).toBe(-10);
    expect(masterIQDailyStats([row()], '2026-10-17T16:00:00.000Z', now).todayTrades).toBe(0);
  });
  test('all confirmed results contribute beyond 1000 rows; open trades have no settled profit', () => {
    expect(masterIQDailyStats([...Array.from({ length: 1001 }, () => row()), row({ result: 'pending', profit: 100 })], '', now).dailyProfit).toBe(-10010);
  });
});