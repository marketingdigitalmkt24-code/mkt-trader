import { test, expect } from 'bun:test';
import { preparedDemoOrder } from './prepared-demo-order';
import { selectDemoByRotation } from './demo-profit-selection';
const at = Date.parse('2026-11-11T07:30:00Z');
const candidate = { signal_id: 'demo-tendencia-alinhada-v1-SUGAR-OTC-1793137440', created_at: new Date(at).toISOString(), direction: 'PUT', entry_strategy: 'TENDENCIA_ALINHADA', _score: 0.14 };
const asset = { enabled: true, is_suspended: false, schedule: [[at / 1000 - 60, at / 1000 + 600]], option: { expiration_times: [60, 300] } };
test('prepared aligned trend submits with its own five-minute expiry', () => {
  expect(preparedDemoOrder(candidate, 1, 4, 123, asset, at)).toEqual({ price: 1, active_id: 123, expired: at / 1000 + 300, direction: 'put', option_type_id: 3, user_balance_id: 4 });
});
test('no prepared order before :00 or after candidate freshness', () => {
  expect(preparedDemoOrder(candidate, 1, 4, 123, asset, at - 1)).toBeNull();
  expect(preparedDemoOrder(candidate, 1, 4, 123, asset, at + 25001)).toBeNull();
});
test('prepared order cannot enable retired strategies or an unavailable market', () => {
  expect(preparedDemoOrder({ ...candidate, entry_strategy: 'TAKASHI_BNF_V1' }, 1, 4, 123, asset, at)).toBeNull();
  expect(preparedDemoOrder(candidate, 1, 4, 123, { ...asset, is_suspended: true }, at)).toBeNull();
});
test('available lower-score signal remains selectable when the top analysis market is closed', () => {
  const closed = { ...candidate, signal_id: 'demo-tendencia-alinhada-v1-closed', asset: 'EUR/JPY', _score: 9 };
  const open = { ...candidate, signal_id: 'demo-tendencia-alinhada-v1-open', asset: 'SUGAR-OTC', _score: .14 };
  const markets = new Map([[closed.asset, { ...asset, enabled: false }], [open.asset, asset]]);
  const eligible = [closed, open].filter(c => {
    const market = markets.get(c.asset);
    return market && preparedDemoOrder(c, 1, 4, 123, market, at);
  });
  expect(selectDemoByRotation(eligible, null)?.signal_id).toBe('demo-tendencia-alinhada-v1-open');
});