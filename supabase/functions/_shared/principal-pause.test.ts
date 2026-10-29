import { test, expect } from 'bun:test';
import { principalIQEnabled, telegramTradingEnabled } from './principal-pause';
import { sendIQAlert } from './telegram-iq-alert';
import { dispatchIQResults } from './telegram-iq-results';
import { dispatchDailyReport } from './telegram-daily-dispatch';

test('principal IQ entries stay blocked while Auto Trading is off', () => {
  expect(principalIQEnabled()).toBe(false);
  expect(principalIQEnabled('TAKASHI_APOS_226_INVERTIDA', false)).toBe(false);
});
test('principal IQ entries run only when Auto Trading is on', () => {
  expect(principalIQEnabled('TAKASHI_APOS_226_INVERTIDA', true)).toBe(true);
});
test('Telegram entries, results and reports are suppressed without requests', async () => {
  expect(telegramTradingEnabled()).toBe(false);
  let calls = 0;
  const request: typeof fetch = async () => { calls++; throw new Error('Unexpected send'); };
  const db = { from() { return { select() { return { or() { return { order() { return { limit: async () => ({ data: [], error: null }) }; } }; } }; } }; } };
  expect(await sendIQAlert({ asset: 'EUR/USD', direction: 'call', expiration: 1, entryAt: Date.now(), signalId: 'super_selecionada-v1-test', timeframe: 'M1', brokerOrderId: '123' }, { lovableKey: 'fixture', telegramKey: 'fixture' }, request)).toBeUndefined();
  expect(await dispatchIQResults(db as Parameters<typeof dispatchIQResults>[0], request)).toBe(0);
  expect(await dispatchDailyReport(db as Parameters<typeof dispatchDailyReport>[0], new Date('2026-10-26T02:59:00Z'), request)).toBe('paused');
  expect(calls).toBe(0);
});
