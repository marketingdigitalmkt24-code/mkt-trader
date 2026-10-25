import { expect, test } from 'bun:test';
import { takashiAfter226Direction, TAKASHI_AFTER_226 } from './takashi-after-226';
import { principalIQEnabled, telegramTradingEnabled } from './principal-pause';
import { selectedTrendCopyRequest } from './selected-trend-copy';
import { copyProfileTargetBlocked } from './copy-target';

const now = Date.parse('2026-10-25T21:08:02Z');
const current = { entry_minute: '2026-10-25T21:08:00Z', entry_strategy: 'TAKASHI_BNF_V1', direction: 'PUT', score: 0.94 };
const previous = { entry_minute: '2026-10-25T21:07:00Z', entry_strategy: 'VELA_FORCA', direction: 'PUT', score: 2.26, status: 'confirmed', iq_option_id: '123' };
test('2.26 Force then Takashi PUT 0.94 opens CALL without a result requirement', () => {
  expect(takashiAfter226Direction(current, previous, now)).toBe('call');
  for (const result of ['win', 'loss', 'pending', 'tie'])
    expect(takashiAfter226Direction(current, { ...previous, result } as typeof previous, now)).toBe('call');
});
test('Takashi CALL inverts to PUT and has no score cutoff', () => {
  expect(takashiAfter226Direction({ ...current, direction: 'CALL', score: 9.3 }, previous, now)).toBe('put');
});
test('requires the immediately previous minute, not a gap or the same minute', () => {
  expect(takashiAfter226Direction(current, { ...previous, entry_minute: '2026-10-25T21:06:00Z' }, now)).toBeNull();
  expect(takashiAfter226Direction(current, { ...previous, entry_minute: current.entry_minute }, now)).toBeNull();
});
test('previous score must display 2.26 and be Force or Trend', () => {
  expect(takashiAfter226Direction(current, { ...previous, entry_strategy: 'TENDENCIA', score: 2.26032894533026 }, now)).toBe('call');
  expect(takashiAfter226Direction(current, { ...previous, score: 2.27 }, now)).toBeNull();
  expect(takashiAfter226Direction(current, { ...previous, entry_strategy: 'REVERSAO_RSI' }, now)).toBeNull();
});
test('requires confirmed previous Demo order and fresh selected Takashi', () => {
  expect(takashiAfter226Direction(current, { ...previous, status: 'failed' }, now)).toBeNull();
  expect(takashiAfter226Direction(current, { ...previous, iq_option_id: null }, now)).toBeNull();
  expect(takashiAfter226Direction(current, previous, Date.parse('2026-10-25T21:08:30Z'))).toBeNull();
});
test('only new strategy permits principal and Telegram; old entries stay paused', () => {
  expect(principalIQEnabled(TAKASHI_AFTER_226)).toBe(true);
  expect(telegramTradingEnabled(TAKASHI_AFTER_226)).toBe(true);
  for (const strategy of [undefined, 'SUPER_SELECIONADA', 'TAKASHI_BNF_V1', 'TENDENCIA_3_LOSS_PUT']) {
    expect(principalIQEnabled(strategy)).toBe(false);
    expect(telegramTradingEnabled(strategy)).toBe(false);
  }
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