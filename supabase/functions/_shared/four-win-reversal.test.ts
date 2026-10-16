import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hasFourWins, invertDirection } from './four-win-reversal.ts';

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