import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isNextMinuteStrategy } from './force-loss-win.ts';
test('only the active real strategies qualify for next-minute execution', () => {
  assert.equal(isNextMinuteStrategy('FORCE_LOSS_WIN'), false);
  assert.equal(isNextMinuteStrategy('THREE_FORCE'), false);
  assert.equal(isNextMinuteStrategy('FOUR_WIN_REVERSAL'), false);
  assert.equal(isNextMinuteStrategy('REVERSAO_RSI'), true);
  assert.equal(isNextMinuteStrategy('RETOMADA'), true);
  assert.equal(isNextMinuteStrategy('RECUO_EMA21'), true);
  assert.equal(isNextMinuteStrategy('VELA_FORCA'), false);
  assert.equal(isNextMinuteStrategy('FORCA_INVERTIDA'), false);
});
