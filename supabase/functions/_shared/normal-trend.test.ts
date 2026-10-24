import { test, expect } from 'bun:test';
import { isNormalPrincipalTrend } from './normal-trend';
import { isMasterIQOrder } from '../../../src/lib/master-iq-results';
import { clientCopyResults } from '../../../src/lib/client-copy-results';
import { countClientCopyResults } from '../../../src/lib/admin-copy-results';
import { selectedTrendCopyRequest } from './selected-trend-copy';

const at = Date.parse('2026-10-24T03:29:00Z');
const normal = { id: '1', asset: 'APPLE-OTC', direction: 'CALL', signal_id: 'tendencia-demo-v1-t7-APPLE-OTC-TENDENCIA-1', entry_strategy: 'TENDENCIA', timeframe: 'M1', iq_option_id: '123', result: 'win', profit: 8.5, created_at: new Date(at).toISOString(), expiration_time: new Date(at + 60000).toISOString(), entry_price: 10 };
test('normal Tendência disappears from principal history and client history/totals', () => {
  expect(isMasterIQOrder(normal)).toBe(false);
  const copy = { ...normal, signal_id: 'copy-client-' + normal.signal_id };
  expect(clientCopyResults([copy], 'client', new Date(at + 1000)).operations).toHaveLength(0);
  expect(countClientCopyResults([copy], 'client')).toEqual({ wins: 0, losses: 0, profit: 0 });
});
test('normal Tendência cannot dispatch a new client copy', () => {
  expect(selectedTrendCopyRequest(normal, at + 1000)).toBeNull();
});
test('legacy normal Tendência IDs are hidden without misclassifying derived strategies', () => {
  expect(isNormalPrincipalTrend({ ...normal, entry_strategy: null })).toBe(true);
  expect(isNormalPrincipalTrend({ signal_id: 'copy-client-' + normal.signal_id })).toBe(true);
  const realCopy = { ...normal, signal_id: 'copy-client-' + normal.signal_id, entry_strategy: 'COPY_TRADE' };
  expect(isNormalPrincipalTrend(realCopy)).toBe(true);
  expect(clientCopyResults([realCopy], 'client', new Date(at + 1000)).operations).toHaveLength(0);
  for (const strategy of ['TENDENCIA_WIN_INVERTIDA', 'TENDENCIA_3_LOSS_PUT', 'QUEDA_WIN_RETRY_V1']) {
    const other = { ...normal, entry_strategy: strategy, signal_id: strategy.toLowerCase() + '-v1-t7-APPLE-OTC-TENDENCIA-1' };
    expect(isNormalPrincipalTrend(other)).toBe(false);
    expect(isMasterIQOrder(other)).toBe(true);
    expect(selectedTrendCopyRequest(other, at + 1000)).not.toBeNull();
  }
});