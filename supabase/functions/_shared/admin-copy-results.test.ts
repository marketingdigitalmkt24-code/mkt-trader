import { describe, expect, it } from 'bun:test';
import { countClientCopyResults, copyResultRates } from '../../../src/lib/admin-copy-results';

describe('admin copy results', () => {
  it('counts only this client’s confirmed copied wins and losses', () => {
    const row = { signal_id: 'copy-client-a-master', result: 'win', iq_option_id: '123', timeframe: 'M1' };
    expect(countClientCopyResults([
      row,
      { ...row, result: 'loss' },
      { ...row, signal_id: 'copy-client-b-master' },
      { ...row, iq_option_id: null },
      { ...row, timeframe: 'TEST' },
      { ...row, result: 'open' },
    ], 'client-a')).toEqual({ wins: 1, losses: 1, profit: 0 });
  });
  it('sums only settled client copy profit, excluding master, other clients and TEST', () => {
    const row = { signal_id: 'copy-client-a-master', result: 'win', iq_option_id: '123', timeframe: 'M1', profit: 8.4 };
    expect(countClientCopyResults([
      row, { ...row, result: 'loss', profit: -10 },
      { ...row, signal_id: 'master', profit: 100 },
      { ...row, signal_id: 'copy-client-b-master', profit: 100 },
      { ...row, timeframe: 'TEST', profit: 100 },
      { ...row, result: 'pending', profit: 100 },
    ], 'client-a').profit).toBeCloseTo(-1.6);
  });
  it('calculates win and loss percentages over decided trades', () => {
    expect(copyResultRates(3, 1)).toEqual({ winPercent: 75, lossPercent: 25 });
  });
  it('shows zero percentages before any decided trades', () => {
    expect(copyResultRates(0, 0)).toEqual({ winPercent: 0, lossPercent: 0 });
  });
});