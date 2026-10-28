import { describe, expect, test } from 'bun:test';
import { loginBeforeBoundary } from './demo-login-retry';

describe('Demo login retry before :00', () => {
  test('keeps retrying after failures until a login succeeds', async () => {
    let t = 0; let calls = 0;
    const ssid = await loginBeforeBoundary(async ms => { calls++; t += ms; return calls === 4 ? 'ok' : null; },
      60000, () => t, async ms => { t += ms; });
    expect(ssid).toBe('ok');
    expect(calls).toBe(4);
  });

  test('stops before the boundary instead of logging in late', async () => {
    let t = 0; let calls = 0;
    const ssid = await loginBeforeBoundary(async ms => { calls++; t += ms; return null; },
      60000, () => t, async ms => { t += ms; });
    expect(ssid).toBeNull();
    expect(t).toBeLessThanOrEqual(57000);
    expect(calls).toBeGreaterThan(5);
  });
});
