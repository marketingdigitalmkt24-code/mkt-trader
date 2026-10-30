import { expect, test } from 'bun:test';
import { usableCachedSession, BROKER_SESSION_MAX_AGE_MS } from './broker-session-cache';

const now = Date.parse('2026-10-30T23:00:00Z');

test('recent cached session is reused', () => {
  expect(usableCachedSession({ ssid: 'session-fixture', obtained_at: new Date(now - 60000).toISOString() }, now)).toBe('session-fixture');
});

test('session older than 12 hours is not reused', () => {
  expect(BROKER_SESSION_MAX_AGE_MS).toBe(12 * 3600 * 1000);
  expect(usableCachedSession({ ssid: 'session-fixture', obtained_at: new Date(now - BROKER_SESSION_MAX_AGE_MS - 1).toISOString() }, now)).toBeNull();
});

test('missing, short or future-dated sessions are ignored', () => {
  expect(usableCachedSession(null, now)).toBeNull();
  expect(usableCachedSession({ ssid: 'x', obtained_at: new Date(now).toISOString() }, now)).toBeNull();
  expect(usableCachedSession({ ssid: 'session-fixture', obtained_at: new Date(now + 3600000).toISOString() }, now)).toBeNull();
});
