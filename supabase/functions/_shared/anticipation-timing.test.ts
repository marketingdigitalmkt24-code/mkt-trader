import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { anticipationTarget, anticipationRequestReady } from './anticipation-timing.ts';
test('scheduled preparation targets next :00 rather than backdating :12 to :00', () => {
  const now = Date.parse('2026-10-21T18:49:12Z');
  assert.equal(anticipationTarget(now, true), Date.parse('2026-10-21T18:50:00Z'));
  assert.equal(anticipationTarget(Date.parse('2026-10-21T18:49:00Z'), true), Date.parse('2026-10-21T18:50:00Z'));
});
test('manual invocation remains immediate', () => {
  const now = Date.parse('2026-10-21T18:49:12Z');
  assert.equal(anticipationTarget(now, false), now);
});
test('no requests before boundary or after existing 30 second window', () => {
  const target = Date.parse('2026-10-21T18:50:00Z');
  assert.equal(anticipationRequestReady(target - 1, target), false);
  assert.equal(anticipationRequestReady(target, target), true);
  assert.equal(anticipationRequestReady(target + 30000, target), true);
  assert.equal(anticipationRequestReady(target + 30001, target), false);
});