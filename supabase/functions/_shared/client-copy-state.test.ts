import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readCopyEnabled, canEnableCopy } from '../../../src/lib/client-copy-state.ts';
import { copyDayStart, copyTargetReached } from './copy-target.ts';

test('returning to the dashboard preserves saved enabled state without changing the configuration', () => {
  const saved = Object.freeze({ enabled: true });
  assert.equal(readCopyEnabled(saved), true);
  assert.equal(readCopyEnabled(saved), true);
  assert.equal(saved.enabled, true);
});
test('manual disable remains off when returning', () => {
  assert.equal(readCopyEnabled({ enabled: false }), false);
});
test('activation requires a confirmed connected IQ Option account', () => {
  assert.equal(canEnableCopy({ is_active: true, last_connected_at: null }), false);
  assert.equal(canEnableCopy({ is_active: false, last_connected_at: '2026-10-17T05:02:00Z' }), false);
  assert.equal(canEnableCopy({ is_active: true, last_connected_at: '2026-10-17T05:02:00Z' }), true);
});
test('daily target stops copying at the target, never below it or with no target', () => {
  assert.equal(copyTargetReached(9.99, 10), false);
  assert.equal(copyTargetReached(10, 10), true);
  assert.equal(copyTargetReached(11, 10), true);
  assert.equal(copyTargetReached(11, 0), false);
});
test('copy daily target uses Brasilia midnight', () => {
  assert.equal(copyDayStart(new Date('2026-10-17T02:59:59Z')), '2026-10-16T03:00:00.000Z');
  assert.equal(copyDayStart(new Date('2026-10-17T03:00:00Z')), '2026-10-17T03:00:00.000Z');
});