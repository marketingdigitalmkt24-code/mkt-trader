import { expect, test } from 'bun:test';
import { expandTestObservations } from '../../../src/lib/live-test-observations';
import { strategyStats } from '../../../src/lib/strategy-stats';

const trump = {
  id: 'trump-2337', timeframe: 'TEST', entry_strategy: 'VELA_FORCA',
  test_inverted_strategy: 'FORCA_INVERTIDA', test_sequence_strategy: null,
  direction: 'CALL', result: 'loss', profit: -10,
};

test('TRUMP 23:37 displays original CALL LOSS -10 and independent inverted PUT WIN +8.50', () => {
  const rows = expandTestObservations(trump);
  expect(rows).toHaveLength(2);
  expect(rows[0]).toEqual(trump);
  expect(rows[1]).toMatchObject({ entry_strategy: 'FORCA_INVERTIDA', direction: 'PUT', result: 'win', profit: 8.5 });
  expect(rows[1].id).not.toBe(rows[0].id);
  expect(trump.result).toBe('loss');
});

test('accuracy attributes TRUMP inverted win only to Força Invertida and original loss to Vela de Força', () => {
  expect(strategyStats([trump])).toEqual([
    { strategy: 'FORCA_INVERTIDA', wins: 1, losses: 0 },
    { strategy: 'VELA_FORCA', wins: 0, losses: 1 },
  ]);
});

test('original win creates inverted loss, without changing original accounting', () => {
  const rows = expandTestObservations({ ...trump, direction: 'PUT', result: 'win', profit: 8.5 });
  expect(rows[0].profit).toBe(8.5);
  expect(rows[1]).toMatchObject({ direction: 'CALL', result: 'loss', profit: -10 });
});

test('no second display entry for broker orders or untagged tests', () => {
  expect(expandTestObservations({ ...trump, timeframe: 'M1' })).toHaveLength(1);
  expect(expandTestObservations({ ...trump, test_inverted_strategy: null })).toHaveLength(1);
});