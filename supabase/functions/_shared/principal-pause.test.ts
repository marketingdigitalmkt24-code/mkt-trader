import { test, expect } from 'bun:test';
import { principalIQEnabled, telegramTradingEnabled } from './principal-pause';
import { sendIQAlert } from './telegram-iq-alert';
import { dispatchIQResults } from './telegram-iq-results';
import { dispatchDailyReport } from './telegram-daily-dispatch';

test('principal IQ and client copy authorization stay paused', () => {
  expect(principalIQEnabled()).toBe(false);
});
test('Telegram entries, results and reports are suppressed without requests', async () => {
  expect(telegramTradingEnabled()).toBe(false);
  let calls = 0;
  const request: typeof fetch = async () => { calls++; throw new Error('Unexpected send'); };
  const db = new Proxy({}, { get() { throw new Error('Unexpected ledger access'); } });
  expect(await sendIQAlert({ asset: 'EUR/USD', direction: 'call', expiration: 1, entryAt: Date.now(), signalId: 'super_selecionada-v1-test', timeframe: 'M1', brokerOrderId: '123' }, { lovableKey: 'fixture', telegramKey: 'fixture' }, request)).toBeUndefined();
  expect(await dispatchIQResults(db as Parameters<typeof dispatchIQResults>[0], request)).toBe(0);
  expect(await dispatchDailyReport(db as Parameters<typeof dispatchDailyReport>[0], new Date('2026-10-26T02:59:00Z'), request)).toBe('paused');
  expect(calls).toBe(0);
});