import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allStrategyRows, strategyStats, type StrategyRow } from '../../../src/lib/strategy-stats.ts';
const row: StrategyRow = { entry_strategy: 'TENDENCIA', result: 'win', timeframe: 'TEST', test_sequence_strategy: null };
test('removed Force LOSS WIN is excluded without removing other force strategies', () => {
  assert.deepEqual(strategyStats([{ ...row, entry_strategy: 'FORCE_LOSS_WIN' }, { ...row, entry_strategy: 'VELA_FORCA' }]),
    [{ strategy: 'VELA_FORCA', wins: 1, losses: 0 }]);
});
test('cumulative accuracy includes results beyond the first 1000 operations', async () => {
  const calls: number[][] = [];
  const rows = await allStrategyRows(async (from, to) => {
    calls.push([from, to]);
    return from === 0 ? Array.from({ length: 1000 }, () => row) : [{ ...row, result: 'loss' }];
  });
  assert.deepEqual(calls, [[0, 999], [1000, 1999]]);
  assert.deepEqual(strategyStats(rows), [{ strategy: 'TENDENCIA', wins: 1000, losses: 1 }]);
});
test('strategy comparison ranks cumulative win rate before operation volume', () => {
  const rows = [
    ...Array.from({ length: 6 }, () => row),
    ...Array.from({ length: 4 }, () => ({ ...row, result: 'loss' })),
    ...Array.from({ length: 3 }, () => ({ ...row, entry_strategy: 'VELA_FORCA' })),
    { ...row, entry_strategy: 'VELA_FORCA', result: 'loss' },
  ];
  assert.deepEqual(strategyStats(rows), [
    { strategy: 'VELA_FORCA', wins: 3, losses: 1 },
    { strategy: 'TENDENCIA', wins: 6, losses: 4 },
  ]);
});
test('settlement updates Retomada counts without counting pending as a loss', () => {
  const tagged = { ...row, test_sequence_strategy: 'TREND_WIN_LOSS_FORCE_LOSS', result: 'test7_open' };
  assert.equal(strategyStats([tagged]).find(s => s.strategy === tagged.test_sequence_strategy)?.losses, 0);
  assert.deepEqual(strategyStats([{ ...tagged, result: 'loss' }]).find(s => s.strategy === tagged.test_sequence_strategy),
    { strategy: 'TREND_WIN_LOSS_FORCE_LOSS', wins: 0, losses: 1 });
});