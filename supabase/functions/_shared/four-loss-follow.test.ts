import { expect, test } from 'bun:test';
import { fourLossFollowDirection, fourLossStreak } from './four-loss-follow';

const now = Date.parse('2026-11-02T05:30:02Z');
const current = { entry_minute: '2026-11-02T05:30:00Z', entry_strategy: 'ICHIMOKU_RECUO21', direction: 'PUT', asset: 'AUD/NZD' };
const loss = (level: number) => ({ status: 'confirmed', result: 'loss', recovery_level: level });
const streak = [loss(3), loss(2), loss(1), loss(0)];

test('after 4 consecutive LOSS the next Demo signal enters in the same direction', () => {
  expect(fourLossFollowDirection(current, streak, now)).toBe('put');
  expect(fourLossFollowDirection({ ...current, direction: 'CALL', entry_strategy: 'RECUO_EMA21' }, streak, now)).toBe('call');
});
test('3 losses or a WIN inside the last 4 never enters', () => {
  expect(fourLossStreak([loss(2), loss(1), loss(0)])).toBe(false);
  expect(fourLossStreak([loss(3), loss(2), { status: 'confirmed', result: 'win', recovery_level: 1 }, loss(0)])).toBe(false);
});
test('if the follow-up also loses, wait for a new streak of 4 (no entry on the 5th+ loss)', () => {
  expect(fourLossStreak([loss(4), loss(3), loss(2), loss(1)])).toBe(false);
  expect(fourLossStreak([loss(0), loss(4), loss(3), loss(2)])).toBe(false);
});
test('pending result or stale/unknown signal never enters', () => {
  expect(fourLossStreak([{ status: 'confirmed', result: 'pending', recovery_level: 3 }, loss(2), loss(1), loss(0)])).toBe(false);
  expect(fourLossFollowDirection(current, streak, Date.parse('2026-11-02T05:30:30Z'))).toBeNull();
  expect(fourLossFollowDirection({ ...current, entry_strategy: 'VELA_FORCA' }, streak, now)).toBeNull();
});
