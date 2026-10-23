import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { isAnticipation, freshAnticipationEntry, confirmedAnticipationOrder, anticipationLeaseScope } from './anticipation-execution.ts';
test('anticipation submits only in observed minute before purchase window closes, never next minute', () => {
  const minute = Date.parse('2026-10-21T19:01:00Z');
  assert.equal(freshAnticipationEntry(minute, minute + 12000), true);
  assert.equal(freshAnticipationEntry(minute, minute - 1), false);
  assert.equal(freshAnticipationEntry(minute, minute + 30000), false);
  assert.equal(freshAnticipationEntry(minute, minute + 60000), false);
});
test('only explicit anticipation strategy takes anticipation execution path', () => {
  assert.equal(isAnticipation('FORCA_ANTECIPADA'), true);
  assert.equal(isAnticipation('VELA_FORCA'), false);
});
test('distinct anticipation orders have independent reservations; duplicate keeps same reservation', () => {
  const a = 'forca_antecipada-111', b = 'forca_antecipada-222';
  assert.equal(anticipationLeaseScope(a), 'master:forca_antecipada:forca_antecipada-111');
  assert.notEqual(anticipationLeaseScope(a), anticipationLeaseScope(b));
  assert.equal(anticipationLeaseScope(a), anticipationLeaseScope(a));
});
test('anticipation can enter at any BRT hour within the fresh purchase window', () => {
  for (let hour = 0; hour < 24; hour++) {
    const minute = Date.UTC(2026, 9, 23, hour + 3, 38);
    assert.equal(freshAnticipationEntry(minute, minute + 1000), true);
  }
});
test('broker entry requires successful numeric IQ confirmation, not a simulated signal', () => {
  assert.equal(confirmedAnticipationOrder({ success: true, tradeId: '14372665294' }), true);
  assert.equal(confirmedAnticipationOrder({ success: true, tradeId: 'test-1' }), false);
  assert.equal(confirmedAnticipationOrder({ success: false, tradeId: '14372665294' }), false);
  assert.equal(confirmedAnticipationOrder({ success: true }), false);
});