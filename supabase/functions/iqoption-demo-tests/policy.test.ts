import { test, expect } from 'bun:test';
import { DEMO_TEST_AMOUNT, freshDemoTest, demoBalance, validDemoTestAmount } from './policy';
test('initial test stake is USD1 and separate configured amounts accept cents', () => {
 expect(DEMO_TEST_AMOUNT).toBe(1);
 expect(validDemoTestAmount(2.5)).toBe(true);
 expect(validDemoTestAmount(10)).toBe(true);
 expect(validDemoTestAmount(.99)).toBe(false);
 expect(validDemoTestAmount(1.001)).toBe(false);
 expect(validDemoTestAmount(NaN)).toBe(false);
});
test('never selects REAL or falls back to another currency', () => {
 expect(demoBalance([{ id: 1, type: 1, currency: 'USD' }])).toBeUndefined();
 expect(demoBalance([{ id: 2, type: 4, currency: 'BRL' }])).toBeUndefined();
 expect(demoBalance([{ id: 1, type: 1, currency: 'USD' }, { id: 2, type: 4, currency: 'USD' }])?.id).toBe(2);
});
test('only fresh selected TEST in own minute can place, no historical replay', () => {
 const row = { signal_id: 't7-SMH-TENDENCIA-1', timeframe: 'TEST', direction: 'CALL', created_at: '2026-10-23T19:00:00Z' };
 const at = Date.parse(row.created_at);
 expect(freshDemoTest(row, at + 10000)).toBe(true);
 expect(freshDemoTest(row, at + 60000)).toBe(false);
 expect(freshDemoTest({ ...row, signal_id: 'anticipation-pavio-1' }, at)).toBe(false);
});
