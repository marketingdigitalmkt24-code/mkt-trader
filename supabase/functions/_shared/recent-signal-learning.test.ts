import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recentLearningAdjustment } from './recent-signal-learning.ts';
const now = Date.parse('2026-10-17T04:48:00-03:00');
const candidate = { asset: 'EUR/USD', direction: 'CALL', entry_strategy: 'VELA_FORCA' };
const row = { ...candidate, result: 'win', created_at: new Date(now - 60000).toISOString() };
test('recent settled wins improve rank and losses reduce rank', () => {
  assert.ok(recentLearningAdjustment([row], candidate, now) > 0);
  assert.ok(recentLearningAdjustment([{ ...row, result: 'loss' }], candidate, now) < 0);
});
test('unresolved, future and opposite-direction results do not teach candidate', () => {
  assert.equal(recentLearningAdjustment([
    { ...row, result: 'test7_open' }, { ...row, created_at: new Date(now).toISOString() },
    { ...row, direction: 'PUT' },
  ], candidate, now), 0);
});
test('losses outweigh equal wins and no evidence is neutral', () => {
  assert.ok(recentLearningAdjustment([row, { ...row, result: 'loss' }], candidate, now) < 0);
  assert.equal(recentLearningAdjustment([], candidate, now), 0);
});
test('newest fifty outcomes receive greater influence with bounded contribution', () => {
  const unrelated = { ...row, asset: 'OTHER', entry_strategy: 'OTHER' };
  assert.ok(recentLearningAdjustment([row], candidate, now)
    > recentLearningAdjustment([...Array(50).fill(unrelated), row], candidate, now));
  assert.ok(recentLearningAdjustment(Array(500).fill(row), candidate, now) < 0.1);
});