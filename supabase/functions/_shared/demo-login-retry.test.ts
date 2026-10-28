import { describe, expect, test } from 'bun:test';
import { loginBeforeBoundary } from './demo-login-retry';

describe('Demo login retry before :00', () => {
  test('never starts a login with less than one second before the preparation cutoff', async () => {
    let calls = 0;
    const result = await loginBeforeBoundary(async () => { calls++; return 'ok'; }, 60000, () => 56500);
    expect(result).toBeNull();
    expect(calls).toBe(0);
  });

  test('gives retries distinct host indexes and rejects a late success', async () => {
    let t = 0;
    const indexes: number[] = [];
    const result = await loginBeforeBoundary(async (ms, index) => {
      indexes.push(index); t += ms;
      if (index === 1) { t = 58000; return 'late'; }
      return null;
    }, 60000, () => t, async ms => { t += ms; });
    expect(indexes).toEqual([0, 1]);
    expect(result).toBeNull();
  });
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
