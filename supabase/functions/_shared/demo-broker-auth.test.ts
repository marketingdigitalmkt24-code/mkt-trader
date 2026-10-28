import { expect, test } from 'bun:test';
import { prepareDemoAuthentication, demoSocketAuthMessage, demoSocketAuthenticationRejected, demoHttpRefreshBudget } from './demo-broker-auth';

const credentials = { email: 'fixture@example.test', password: 'fixture-only' };

test('HTTP timeout preserves the minute for direct WebSocket authentication', async () => {
  let time = 0;
  let calls = 0;
  const auth = await prepareDemoAuthentication(credentials, async ms => {
    calls++; time += ms; return null;
  }, 60000, () => time);
  expect(calls).toBe(1);
  expect(time).toBe(10000);
  expect(auth?.mode).toBe('credentials');
  if (!auth) throw new Error('Expected direct fallback');
  expect(demoSocketAuthMessage(auth)).toEqual({ name: 'authenticate', msg: credentials });
});

test('successful HTTP login authenticates on the same socket by session', async () => {
  const auth = await prepareDemoAuthentication(credentials, async () => 'fixture-session', 60000, () => 0);
  expect(auth?.mode).toBe('ssid');
  if (!auth) throw new Error('Expected session');
  expect(demoSocketAuthMessage(auth)).toEqual({ name: 'ssid', msg: 'fixture-session' });
});

test('HTTP network exceptions use direct fallback without repeated login requests', async () => {
  const auth = await prepareDemoAuthentication(credentials, async () => { throw new Error('timeout'); }, 60000, () => 0);
  expect(auth?.mode).toBe('credentials');
});

test('no authentication starts after the original preparation deadline', async () => {
  let calls = 0;
  expect(await prepareDemoAuthentication(credentials, async () => { calls++; return null; }, 60000, () => 58000)).toBeNull();
  expect(calls).toBe(0);
});

test('late HTTP completion cannot authorize another minute', async () => {
  let time = 0;
  expect(await prepareDemoAuthentication(credentials, async () => { time = 58000; return 'late'; }, 60000, () => time)).toBeNull();
});

test('authentication refusal fails immediately rather than waiting for candle timeout', () => {
  expect(demoSocketAuthenticationRejected({ name: 'authentication_error' })).toBe(true);
  expect(demoSocketAuthenticationRejected({ name: 'authenticated', msg: false })).toBe(true);
  expect(demoSocketAuthenticationRejected({ name: 'authenticated', msg: true })).toBe(false);
  expect(demoSocketAuthenticationRejected({ name: 'heartbeat' })).toBe(false);
});

test('both failed socket endpoints allow bounded HTTP refresh with time left for handshake', () => {
  expect(demoHttpRefreshBudget(0,60000,10000)).toBe(0);
  expect(demoHttpRefreshBudget(1,60000,20000)).toBe(0);
  expect(demoHttpRefreshBudget(2,60000,30000)).toBe(5000);
  expect(demoHttpRefreshBudget(4,60000,48000)).toBe(0);
});