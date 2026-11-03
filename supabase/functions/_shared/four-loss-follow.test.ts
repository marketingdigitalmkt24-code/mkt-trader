import { expect, test } from 'bun:test';
import { fourLossFollowDirection, fourLossStreak } from './four-loss-follow';

const now = Date.parse('2026-11-02T05:30:02Z');
const current = { entry_minute: '2026-11-02T05:30:00Z', entry_strategy: 'ICHIMOKU_RECUO21', direction: 'PUT', asset: 'AUD/NZD' };
const loss = (level: number) => ({ status: 'confirmed', result: 'loss', recovery_level: level });
const streak = [loss(4), loss(3), loss(2), loss(1), loss(0)];

test('after 5 consecutive LOSS the next Demo signal enters in the same direction', () => {
  expect(fourLossFollowDirection(current, streak, now)).toBe('put');
  expect(fourLossFollowDirection({ ...current, direction: 'CALL', entry_strategy: 'RECUO_EMA21' }, streak, now)).toBe('call');
});
test('4 losses never enter', () => {
  expect(fourLossStreak([loss(3), loss(2), loss(1), loss(0)])).toBe(false);
  expect(fourLossFollowDirection(current, [loss(3), loss(2), loss(1), loss(0), { status: 'confirmed', result: 'win', recovery_level: 0 }], now)).toBeNull();
});
test('a WIN inside the last 5 never enters', () => {
  expect(fourLossStreak([loss(4), loss(3), { status: 'confirmed', result: 'win', recovery_level: 2 }, loss(1), loss(0)])).toBe(false);
});
test('pending result or stale/unknown signal never enters', () => {
  expect(fourLossStreak([{ status: 'confirmed', result: 'pending', recovery_level: 4 }, loss(3), loss(2), loss(1), loss(0)])).toBe(false);
  expect(fourLossFollowDirection(current, streak, Date.parse('2026-11-02T05:30:30Z'))).toBeNull();
  expect(fourLossFollowDirection({ ...current, entry_strategy: 'FORCA_ANTECIPADA_V1' }, streak, now)).toBeNull();
});
