import { describe, expect, it } from 'vitest';
import { autoTradingAllows, masterAutoTradingEnabled } from './auto-trading-gate';

const db = (enabled: boolean | null) => ({
  rpc: async () => ({ data: [{ user_id: 'admin' }], error: null }),
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: enabled === null ? null : { auto_trading_enabled: enabled }, error: null }) }) }) }),
});

describe('auto trading gate', () => {
  it('blocks IQ Option entries when Auto Trading is off', async () => {
    expect(await masterAutoTradingEnabled(db(false))).toBe(false);
  });
  it('blocks when no settings exist', async () => {
    expect(await masterAutoTradingEnabled(db(null))).toBe(false);
    expect(autoTradingAllows(undefined)).toBe(false);
  });
  it('allows when Auto Trading is on', async () => {
    expect(await masterAutoTradingEnabled(db(true))).toBe(true);
  });
});

describe('auto trading gate table', () => {
  it('reads the admin switch from user_trading_settings', async () => {
    const tables: string[] = [];
    const spy = { ...db(true), from: (t: string) => { tables.push(t); return db(true).from(); } };
    expect(await masterAutoTradingEnabled(spy)).toBe(true);
    expect(tables).toEqual(['user_trading_settings']);
  });
});
