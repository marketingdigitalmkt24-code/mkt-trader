import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hasForceLossWin, forceEntryDirection, isNextMinuteStrategy } from './force-loss-win.ts';
import { nextReversalMinute, canSendReversal } from './four-win-reversal.ts';

const candidate = Date.parse('2026-10-16T21:37:00-03:00');
const win = { strategy: 'VELA_FORCA', result: 'win', minuteMs: Date.parse('2026-10-16T21:36:00-03:00') };
const loss = { strategy: 'VELA_FORCA', result: 'loss', minuteMs: Date.parse('2026-10-16T21:35:00-03:00') };
test('21:35 force LOSS then 21:36 force WIN authorizes 21:37, not 21:38', () => {
  assert.equal(hasForceLossWin([win, loss], candidate), true);
  assert.equal(hasForceLossWin([win, loss], candidate + 60000), false);
  assert.equal(nextReversalMinute(candidate), candidate);
});
test('both preceding results must be Vela de Força, in LOSS then WIN order', () => {
  assert.equal(hasForceLossWin([loss, win], candidate), false);
  assert.equal(hasForceLossWin([{ ...win, strategy: 'TENDENCIA' }, loss], candidate), false);
  assert.equal(hasForceLossWin([win, { ...loss, strategy: 'TENDENCIA' }], candidate), false);
  for (const result of ['tie', 'test7_open', 'expired', 'loss']) {
    assert.equal(hasForceLossWin([{ ...win, result }, loss], candidate), false);
  }
  assert.equal(hasForceLossWin([win], candidate), false);
});
test('missing minute breaks the pair', () => {
  assert.equal(hasForceLossWin([win, { ...loss, minuteMs: loss.minuteMs - 60000 }], candidate), false);
});
test('next signal direction is preserved, not reversed', () => {
  assert.equal(forceEntryDirection('CALL'), 'CALL');
  assert.equal(forceEntryDirection('PUT'), 'PUT');
});
test('both authorized strategies use the same-minute purchase window', () => {
  assert.equal(isNextMinuteStrategy('FORCE_LOSS_WIN'), true);
  assert.equal(isNextMinuteStrategy('FOUR_WIN_REVERSAL'), true);
  assert.equal(isNextMinuteStrategy('VELA_FORCA'), false);
  assert.equal(canSendReversal(candidate, candidate + 5000), true);
  assert.equal(canSendReversal(candidate, candidate + 30000), false);
});