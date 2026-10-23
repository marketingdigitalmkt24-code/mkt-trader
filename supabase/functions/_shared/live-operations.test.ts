import { describe, expect, test } from 'bun:test';
import { isLiveBrokerOperation, LIVE_OPERATIONS_DISPLAY_CUTOFF } from '../../../src/lib/live-operations';

const order = { signal_id: 'retomada-1', timeframe: 'M1', iq_option_id: '14383442576', created_at: '2026-10-23T18:40:00.000Z', entry_strategy: 'RETOMADA' };
describe('Últimas operações', () => {
  test('shows a confirmed principal IQ order after the display cleanup', () => expect(isLiveBrokerOperation(order)).toBe(true));
  test('hides TEST simulations, client copies and unconfirmed orders', () => {
    for (const extra of [{ timeframe: 'TEST' }, { signal_id: 'copy-client-retomada-1' }, { iq_option_id: null }])
      expect(isLiveBrokerOperation({ ...order, ...extra })).toBe(false);
  });
  test('hides operations before 23/10 15:39:21 Brasília without deleting them', () => {
    expect(LIVE_OPERATIONS_DISPLAY_CUTOFF).toBe('2026-10-23T18:39:21.000Z');
    expect(isLiveBrokerOperation({ ...order, created_at: '2026-10-23T18:27:06.279Z' })).toBe(false);
  });
});