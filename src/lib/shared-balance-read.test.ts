import { describe, expect, test, beforeEach } from 'bun:test';
import { sharedBalanceRead, resetSharedBalanceCache, BALANCE_MIN_INTERVAL_MS } from './shared-balance-read';

describe('shared broker balance read', () => {
  beforeEach(() => resetSharedBalanceCache());

  test('simultaneous cards trigger only one broker login', async () => {
    let calls = 0;
    const invoke = async () => { calls++; return { data: { success: true, balance: 10 }, error: null }; };
    await Promise.all([sharedBalanceRead('u', invoke), sharedBalanceRead('u', invoke), sharedBalanceRead('u', invoke)]);
    expect(calls).toBe(1);
  });

  test('reuses the result for 30 seconds, then reads again', async () => {
    let calls = 0; let t = 1000;
    const invoke = async () => { calls++; return { data: { success: true }, error: null }; };
    await sharedBalanceRead('u', invoke, () => t);
    t += BALANCE_MIN_INTERVAL_MS - 1;
    await sharedBalanceRead('u', invoke, () => t);
    expect(calls).toBe(1);
    t += 1;
    await sharedBalanceRead('u', invoke, () => t);
    expect(calls).toBe(2);
    expect(BALANCE_MIN_INTERVAL_MS).toBe(30000);
  });
});
