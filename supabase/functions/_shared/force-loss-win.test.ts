import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isNextMinuteStrategy } from './force-loss-win.ts';
test('removed FORCE_LOSS_WIN never qualifies for next-minute execution', () => {
  assert.equal(isNextMinuteStrategy('FORCE_LOSS_WIN'), false);
  assert.equal(isNextMinuteStrategy('THREE_FORCE'), true);
  assert.equal(isNextMinuteStrategy('FOUR_WIN_REVERSAL'), true);
});
