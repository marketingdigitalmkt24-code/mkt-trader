import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hasFourWins, invertDirection, nextReversalMinute, canSendReversal, canReuseBrokerSession } from './four-win-reversal.ts';

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
test('candidate at 20:16 BRT targets exactly 20:17 BRT, never another minute', () => {
  assert.equal(nextReversalMinute(Date.parse('2026-10-16T20:16:00-03:00')), Date.parse('2026-10-16T20:17:00-03:00'));
});
test('a delayed timer must not submit at or after the selected minute', () => {
  const entryAt = Date.parse('2026-10-16T20:17:00-03:00');
  assert.equal(canSendReversal(entryAt, entryAt - 120), true);
  assert.equal(canSendReversal(entryAt, entryAt), false);
  assert.equal(canSendReversal(entryAt, entryAt + 2500), false);
});