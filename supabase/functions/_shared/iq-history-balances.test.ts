import { expect, test } from 'bun:test';
import { historyBalanceIds } from './iq-history-balances';

test('reconciles old Demo orders after switching to Real without changing placement', () => {
  expect(historyBalanceIds([{ id: 11, type: 1 }, { id: 44, type: 4 }])).toEqual([11, 44]);
});
test('reconciles old Real orders after switching to Demo', () => {
  expect(historyBalanceIds([{ id: 44, type: 4 }, { id: 11, type: 1 }])).toEqual([44, 11]);
});
test('never falls back to an unrelated wallet', () => {
  expect(historyBalanceIds([{ id: 99, type: 2 }])).toEqual([]);
});