import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isPracticeAccount, verifiedDemoBalance } from './demo-refill.ts';
test('refill permits only PRACTICE, never REAL or unknown accounts', () => {
  assert.equal(isPracticeAccount('PRACTICE'), true);
  assert.equal(isPracticeAccount('REAL'), false);
  assert.equal(isPracticeAccount(''), false);
});
test('broker must confirm a type 4 demo balance of exactly 10000', () => {
  assert.equal(verifiedDemoBalance({ type: 4, amount: 10000 }), true);
  assert.equal(verifiedDemoBalance({ type: 1, amount: 10000 }), false);
  assert.equal(verifiedDemoBalance({ type: 4, amount: 9000 }), false);
  assert.equal(verifiedDemoBalance(undefined), false);
});