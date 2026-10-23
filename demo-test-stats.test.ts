import { test, expect } from 'bun:test';
import { allDemoOutcomes, demoTestStats } from './src/lib/demo-test-stats';
const row = (result: string, profit: number) => ({ status: 'confirmed', iq_option_id: '14383504823', result, profit });
test('counts confirmed Demo wins and losses with accuracy and negative net', () => {
 expect(demoTestStats([row('win', .82), row('loss', -1), row('win', .83), row('loss', -1), row('loss', -1)]))
  .toEqual({ wins: 2, losses: 3, ties: 0, pending: 0, accuracy: 40, profit: -1.35 });
});
test('keeps ties and open or unconfirmed orders out of accuracy and pending profit', () => {
 expect(demoTestStats([row('win', .82), row('tie', 0), row('pending', 100), { ...row('loss', -1), status: 'failed' }]))
  .toEqual({ wins: 1, losses: 0, ties: 1, pending: 1, accuracy: 100, profit: .82 });
 expect(demoTestStats([]).accuracy).toBe(0);
});
test('accumulates all pages rather than only displayed orders', async () => {
 const rows = await allDemoOutcomes(async (from, to) => {
  expect(to - from).toBe(999);
  return from === 0 ? Array.from({ length: 1000 }, () => row('win', 1)) : [row('loss', -1)];
 });
 expect(demoTestStats(rows).wins).toBe(1000);
 expect(demoTestStats(rows).losses).toBe(1);
 expect(demoTestStats(rows).profit).toBe(999);
});