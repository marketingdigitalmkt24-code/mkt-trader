import { expect, test } from 'bun:test';
import { combinedLearnedScore } from './demo-continuation.ts';

const t = '2026-10-26T14:00:00Z';
const rows = (result: string, n: number) => Array.from({ length: n }, () => ({ entry_strategy: 'VELA_FORCA', entry_minute: t, result, profit: result === 'win' ? 1 : -1, asset: 'X' }));

test('rejected TEST outcomes count at half weight', () => {
  const base = combinedLearnedScore([], [], 0, 'VELA_FORCA', 'X', Date.parse(t));
  const withWins = combinedLearnedScore([], [], 0, 'VELA_FORCA', 'X', Date.parse(t), rows('win', 5));
  const asDemo = combinedLearnedScore(rows('win', 5), [], 0, 'VELA_FORCA', 'X', Date.parse(t));
  expect(base).toBe(0);
  expect(withWins).toBe(asDemo * 0.5);
});
