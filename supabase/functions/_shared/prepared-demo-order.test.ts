import { test, expect } from 'bun:test';
import { preparedDemoOrder } from './prepared-demo-order';
const at = Date.parse('2026-10-27T21:44:00Z');
const candidate = { signal_id: 'takashi-bnf-v1-SUGAR-OTC-1793137440', created_at: new Date(at).toISOString(), direction: 'PUT', entry_strategy: 'TAKASHI_BNF_V1', _score: 0.14 };
const asset = { enabled: true, is_suspended: false, schedule: [[at / 1000 - 60, at / 1000 + 120]], option: { expiration_times: [60] } };
test('prepared Takashi submits at :00 with US$1 and its own one-minute expiry', () => {
  expect(preparedDemoOrder(candidate, 1, 4, 123, asset, at)).toEqual({ price: 1, active_id: 123, expired: at / 1000 + 60, direction: 'put', option_type_id: 3, user_balance_id: 4 });
});
test('no prepared order before :00 or after candidate freshness', () => {
  expect(preparedDemoOrder(candidate, 1, 4, 123, asset, at - 1)).toBeNull();
  expect(preparedDemoOrder(candidate, 1, 4, 123, asset, at + 25001)).toBeNull();
});
test('prepared order cannot enable retired strategies or an unavailable market', () => {
  expect(preparedDemoOrder({ ...candidate, entry_strategy: 'VELA_FORCA' }, 1, 4, 123, asset, at)).toBeNull();
  expect(preparedDemoOrder(candidate, 1, 4, 123, { ...asset, is_suspended: true }, at)).toBeNull();
});