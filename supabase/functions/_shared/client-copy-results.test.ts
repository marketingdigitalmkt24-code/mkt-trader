import { describe, expect, it } from 'bun:test';
import { clientCopyResults, clientDayStart } from '../../../src/lib/client-copy-results';

const now = new Date('2026-10-17T21:54:00Z');
const row = { id: 'copy', signal_id: 'copy-client-a-master', asset: 'JUP/USD-OTC', direction: 'CALL', result: 'win', profit: 82, iq_option_id: '14364506418', timeframe: 'M1', created_at: '2026-10-17T15:14:05Z' };
describe('client dashboard isolation', () => {
  it('retains the client’s $82 win without merging the principal’s $10 loss on the same broker account', () => {
    const result = clientCopyResults([row,
      { ...row, id: 'master', signal_id: 'fourwin-master', result: 'loss', profit: -10, iq_option_id: '14364506363' },
      { ...row, id: 'other', signal_id: 'copy-client-b-master', profit: 8.2 },
    ], 'client-a', now);
    expect(result.profit).toBe(82);
    expect(result.wins).toBe(1);
    expect(result.losses).toBe(0);
    expect(result.operations.map(op => op.iq_option_id)).toEqual(['14364506418']);
  });
  it('excludes unconfirmed and test entries and never counts open orders as ties or settled trades', () => {
    const result = clientCopyResults([row, { ...row, result: 'open', profit: 0 },
      { ...row, iq_option_id: null }, { ...row, timeframe: 'TEST' }], 'client-a', now);
    expect(result.operations.length).toBe(2);
    expect(result.trades).toBe(1);
    expect(result.profit).toBe(82);
  });
  it('uses midnight in Brasília regardless of browser timezone', () => {
    expect(clientDayStart(new Date('2026-10-18T02:59:00Z'))).toBe('2026-10-17T03:00:00.000Z');
    expect(clientCopyResults([{ ...row, created_at: '2026-10-17T02:59:00Z' }, row], 'client-a', now).trades).toBe(1);
  });
  it('includes all daily results instead of truncating totals at 50 entries', () => {
    expect(clientCopyResults(Array.from({ length: 65 }, (_, i) => ({ ...row, id: String(i) })), 'client-a', now).profit).toBe(5330);
  });
});