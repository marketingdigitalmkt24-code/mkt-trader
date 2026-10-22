import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allStrategyRows, strategyStats, strategyAccuracyDisplay, TESTS_GROUPED_KEY, type StrategyRow } from '../../../src/lib/strategy-stats.ts';
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
test('Force first TEST counts separately from original Force', () => {
  const stats = strategyStats([
    { ...row, entry_strategy: 'VELA_FORCA', result: 'win' },
    { ...row, entry_strategy: 'FORCA_SEM_ROMPIMENTO_PRIMEIRA', result: 'loss' },
  ]);
  assert.deepEqual(stats.find(s => s.strategy === 'VELA_FORCA'), { strategy: 'VELA_FORCA', wins: 1, losses: 0 });
  assert.deepEqual(stats.find(s => s.strategy === 'FORCA_SEM_ROMPIMENTO_PRIMEIRA'), { strategy: 'FORCA_SEM_ROMPIMENTO_PRIMEIRA', wins: 0, losses: 1 });
});
test('accuracy display keeps active strategies and groups all other tests into one row', () => {
  const stats = strategyStats([
    { ...row, entry_strategy: 'ICHIMOKU_FORCA', result: 'win' },
    { ...row, entry_strategy: 'KDJ_RSI', result: 'loss' },
    { ...row, entry_strategy: 'KDJ_RSI', result: 'win' },
    { ...row, entry_strategy: 'TENDENCIA', result: 'loss' },
    { ...row, entry_strategy: 'FORCA_SEM_ROMPIMENTO_PRIMEIRA', result: 'win' },
    { ...row, entry_strategy: 'VELA_FORCA', result: 'loss' },
  ]);
  const display = strategyAccuracyDisplay(stats);
  assert.deepEqual(
    display.find(s => s.strategy === 'ICHIMOKU_FORCA'),
    { strategy: 'ICHIMOKU_FORCA', wins: 1, losses: 0 });
  assert.deepEqual(
    display.find(s => s.strategy === 'KDJ_RSI'),
    { strategy: 'KDJ_RSI', wins: 1, losses: 1 });
  assert.deepEqual(display.find(s => s.strategy === TESTS_GROUPED_KEY),
    { strategy: TESTS_GROUPED_KEY, wins: 1, losses: 2 });
  assert.equal(display.length, 3);
});
test('accuracy display omits the tests row when only active strategies exist', () => {
  const stats = strategyStats([{ ...row, entry_strategy: 'KDJ_RSI', result: 'win' }]);
  assert.deepEqual(strategyAccuracyDisplay(stats), [{ strategy: 'KDJ_RSI', wins: 1, losses: 0 }]);
});
test('three Trend losses PUT retains independent confirmed broker accuracy', () => {
  const display = strategyAccuracyDisplay(strategyStats([
    { ...row, entry_strategy: 'TENDENCIA_3_LOSS_PUT', timeframe: 'M1', result: 'win' },
    { ...row, entry_strategy: 'TENDENCIA_3_LOSS_PUT', timeframe: 'M1', result: 'loss' },
    row,
  ]));
  assert.deepEqual(display.find(s => s.strategy === 'TENDENCIA_3_LOSS_PUT'), { strategy: 'TENDENCIA_3_LOSS_PUT', wins: 1, losses: 1 });
});