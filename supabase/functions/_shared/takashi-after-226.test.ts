import { expect, test } from 'bun:test';
import { takashiAfter226Direction, TAKASHI_AFTER_226 } from './takashi-after-226';

import { selectedTrendCopyRequest } from './selected-trend-copy';
import { copyProfileTargetBlocked } from './copy-target';

const now = Date.parse('2026-10-25T21:08:02Z');
const current = { entry_minute: '2026-10-25T21:08:00Z', entry_strategy: 'TAKASHI_BNF_V1', direction: 'CALL', asset: 'ONDOUSD-OTC' };
test('every Demo Takashi signal enters inverted: CALL -> PUT, PUT -> CALL, no previous WIN needed', () => {
  expect(takashiAfter226Direction(current, now)).toBe('put');
  expect(takashiAfter226Direction({ ...current, direction: 'PUT' }, now)).toBe('call');
});
test('non-Takashi or invalid direction signals never enter', () => {
  expect(takashiAfter226Direction({ ...current, entry_strategy: 'VELA_FORCA' }, now)).toBeNull();
  expect(takashiAfter226Direction({ ...current, direction: 'HOLD' }, now)).toBeNull();
  expect(takashiAfter226Direction(null, now)).toBeNull();
});
test('current signal must be fresh (first 30s of its minute)', () => {
  expect(takashiAfter226Direction(current, Date.parse('2026-10-25T21:08:30Z'))).toBeNull();
});
test('confirmed principal copies retain inverse direction and exact minute', () => {
  const copy = selectedTrendCopyRequest({ signal_id: 'takashi_apos_226_invertida-v1-fresh', asset: 'BIDU-OTC', direction: 'CALL', iq_option_id: '456', entry_strategy: TAKASHI_AFTER_226, timeframe: 'M1', expiration_time: '2026-10-25T21:09:00Z', entry_price: 10 }, now);
  expect(copy?.direction).toBe('call');
  expect(copy?.entryAt).toBe(Date.parse(current.entry_minute));
});
test('client percentage target uses its own confirmed broker balance and blocks unknown balance', () => {
  expect(copyProfileTargetBlocked(10, 10, 'percentage', 110)).toBe(true);
  expect(copyProfileTargetBlocked(9, 10, 'percentage', 109)).toBe(false);
  expect(copyProfileTargetBlocked(0, 10, 'percentage', NaN)).toBe(true);
  expect(copyProfileTargetBlocked(100, 100, 'value', 1000)).toBe(true);
});
