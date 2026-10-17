import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hasFourWins, invertDirection, nextReversalMinute, canSendReversal, canReuseBrokerSession, isBlockedByMiddleForceCandles } from './four-win-reversal.ts';

test('four consecutive wins authorize the next signal, three do not', () => {
  assert.equal(hasFourWins(['win', 'win', 'win', 'win']), true);
  assert.equal(hasFourWins(['win', 'win', 'win']), false);
});
test('loss, tie and pending break the four-win sequence', () => {
  for (const result of ['loss', 'tie', 'test7_open', 'expired']) {
    assert.equal(hasFourWins(['win', result, 'win', 'win', 'win']), false);
  }
});
test('invert the NEXT signal in both directions', () => {
  assert.equal(invertDirection('CALL'), 'PUT');
  assert.equal(invertDirection('PUT'), 'CALL');
});
test('only authorized server calls can reuse the same active broker account session', () => {
  assert.equal(canReuseBrokerSession(true, 'account-a', 'account-a'), true);
  assert.equal(canReuseBrokerSession(false, 'account-a', 'account-a'), false);
  assert.equal(canReuseBrokerSession(true, 'account-a', 'account-b'), false);
  assert.equal(canReuseBrokerSession(true, '', ''), false);
});
test('wins at 20:54-20:57 BRT: reversal enters at 20:58 BRT, not 20:59', () => {
  assert.equal(nextReversalMinute(Date.parse('2026-10-16T20:58:00-03:00')), Date.parse('2026-10-16T20:58:00-03:00'));
});
test('reversal may be sent early in the entry minute but never after 30 seconds', () => {
  const entryAt = Date.parse('2026-10-16T20:58:00-03:00');
  assert.equal(canSendReversal(entryAt, entryAt + 5000), true);
  assert.equal(canSendReversal(entryAt, entryAt + 30000), false);
});
// Example 17/10 01:04-01:07 BRT: Tendência, Tendência, Vela de Força, Vela de Força (oldest first).
// Newest-first array: the two middle entries are both VELA_FORCA, so nothing is sent.
test('two middle Vela de Força wins block the reversal', () => {
  assert.equal(isBlockedByMiddleForceCandles(['VELA_FORCA', 'VELA_FORCA', 'TENDENCIA', 'TENDENCIA']), true);
});
test('other four-win sequences still send', () => {
  assert.equal(isBlockedByMiddleForceCandles(['TENDENCIA', 'TENDENCIA', 'TENDENCIA', 'TENDENCIA']), false);
  assert.equal(isBlockedByMiddleForceCandles(['VELA_FORCA', 'TENDENCIA', 'VELA_FORCA', 'TENDENCIA']), false);
  assert.equal(isBlockedByMiddleForceCandles(['TENDENCIA', 'VELA_FORCA', 'TENDENCIA', 'VELA_FORCA']), false);
});
test('adjacent Vela de Força pair blocks in any position', () => {
  assert.equal(isBlockedByMiddleForceCandles(['TENDENCIA', 'VELA_FORCA', 'VELA_FORCA', 'TENDENCIA']), true);
  assert.equal(isBlockedByMiddleForceCandles(['VELA_FORCA', 'TENDENCIA', 'VELA_FORCA', 'VELA_FORCA']), true);
});