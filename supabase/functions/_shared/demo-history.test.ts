import { test, expect } from 'bun:test';
import { demoHistoryOutcome } from './demo-history';
test('settles SUGAR only by its exact recorded broker order ID', () => {
  expect(demoHistoryOutcome({ id: 'hash', status: 'closed', pnl_net: -1,
    raw_event: { binary_options_option_changed1: { id: 14395548093, result: 'loose' } } }))
    .toEqual({ ids: ['14395548093'], profit: -1, result: 'loss' });
});
test('a closed position with no numeric order ID cannot settle any Demo row', () => {
  expect(demoHistoryOutcome({ id: 'hash', status: 'closed', pnl_net: 0.82, asset: 'SUGAR-OTC' })).toBeNull();
});