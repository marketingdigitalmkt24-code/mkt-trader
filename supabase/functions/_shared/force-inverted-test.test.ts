import { expect, test } from 'bun:test';
import { forceInvertedTag, invertedTestOutcome, FORCE_INVERTED_TEST } from './force-inverted-test';
import { strategyStats } from '../../../src/lib/strategy-stats';
test('only selected Force TEST signals receive the observation', () => {
  expect(forceInvertedTag('TEST', 'VELA_FORCA')).toBe(FORCE_INVERTED_TEST);
  expect(forceInvertedTag('M1', 'VELA_FORCA')).toBeNull();
  expect(forceInvertedTag('TEST', 'TENDENCIA')).toBeNull();
});
test('CALL becomes PUT and a base win becomes inverted loss', () => {
  expect(invertedTestOutcome('CALL', 'win')).toEqual({ direction: 'PUT', result: 'loss', profit: -10 });
});
test('PUT becomes CALL and a base loss becomes inverted win', () => {
  expect(invertedTestOutcome('PUT', 'loss')).toEqual({ direction: 'CALL', result: 'win', profit: 8.5 });
});
test('ties remain ties and open signals stay pending', () => {
  expect(invertedTestOutcome('CALL', 'tie')).toEqual({ direction: 'PUT', result: 'tie', profit: 0 });
  expect(invertedTestOutcome('PUT', 'test7_open')?.result).toBe('test7_open');
});
test('untagged history and non TEST results never count as inverted', () => {
  const row = { entry_strategy: 'VELA_FORCA', result: 'loss', timeframe: 'TEST', test_sequence_strategy: null };
  expect(strategyStats([row]).some(s => s.strategy === FORCE_INVERTED_TEST)).toBe(false);
  const tagged = { ...row, test_inverted_strategy: FORCE_INVERTED_TEST };
  expect(strategyStats([tagged]).find(s => s.strategy === FORCE_INVERTED_TEST)).toEqual({ strategy: FORCE_INVERTED_TEST, wins: 1, losses: 0 });
  expect(strategyStats([{ ...tagged, timeframe: 'M1' }]).some(s => s.strategy === FORCE_INVERTED_TEST)).toBe(false);
  expect(strategyStats([{ ...tagged, result: 'test7_open' }]).find(s => s.strategy === FORCE_INVERTED_TEST)).toEqual({ strategy: FORCE_INVERTED_TEST, wins: 0, losses: 0 });
});
