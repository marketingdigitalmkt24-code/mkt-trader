import { expect, test } from 'bun:test';
import { expandTestObservations } from '../../../src/lib/live-test-observations';
import { strategyStats } from '../../../src/lib/strategy-stats';

// Força Invertida removed Oct 20 2026: no projection, no accuracy line, original kept.
const trump = {
  id: 'trump-2337', timeframe: 'TEST', entry_strategy: 'VELA_FORCA',
  test_inverted_strategy: 'FORCA_INVERTIDA', test_sequence_strategy: null,
  direction: 'CALL', result: 'loss', profit: -10,
};

test('tagged Vela de Força shows only the original entry', () => {
  expect(expandTestObservations(trump)).toEqual([trump]);
});

test('stored Força Invertida rows are hidden from the test list', () => {
  expect(expandTestObservations({ ...trump, entry_strategy: 'FORCA_INVERTIDA' })).toHaveLength(0);
});

test('accuracy has no Força Invertida line, original loss stays on Vela de Força', () => {
  expect(strategyStats([trump, { ...trump, entry_strategy: 'FORCA_INVERTIDA', timeframe: 'M1', result: 'win' }]))
    .toEqual([{ strategy: 'VELA_FORCA', wins: 0, losses: 1 }]);
});
