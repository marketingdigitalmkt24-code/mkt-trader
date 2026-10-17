import { describe, expect, it } from 'bun:test';
import { countClientCopyResults } from '../../../src/lib/admin-copy-results';

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
    ], 'client-a')).toEqual({ wins: 1, losses: 1 });
  });
});