import { expect, test } from 'bun:test';
import { linkedForceBrokerResult } from '../../../src/lib/test-broker-result';

const observation = { id: 'f406ba41-dfed-4afd-ba24-5eaf869b2759:force-inverted', timeframe: 'TEST', entry_strategy: 'FORCA_INVERTIDA', result: 'win', profit: 8.5 };
const order = { signal_id: 'forca_invertida-f406ba41-dfed-4afd-ba24-5eaf869b2759', iq_option_id: '14369555193', timeframe: 'M1', result: 'loss', profit: -10 };

test('SEI simulated WIN +8.50 remains separate from broker LOSS -10', () => {
  expect(linkedForceBrokerResult(observation, [order])).toMatchObject({ iq_option_id: '14369555193', result: 'loss', profit: -10 });
  expect(observation).toMatchObject({ result: 'win', profit: 8.5 });
});
test('copy, simulated and unrelated orders cannot supply broker outcomes', () => {
  expect(linkedForceBrokerResult(observation, [{ ...order, signal_id: `copy-user-${order.signal_id}` }])).toBeUndefined();
  expect(linkedForceBrokerResult(observation, [{ ...order, iq_option_id: 'sim-123' }])).toBeUndefined();
  expect(linkedForceBrokerResult(observation, [{ ...order, timeframe: 'TEST' }])).toBeUndefined();
  expect(linkedForceBrokerResult({ ...observation, entry_strategy: 'VELA_FORCA' }, [order])).toBeUndefined();
});