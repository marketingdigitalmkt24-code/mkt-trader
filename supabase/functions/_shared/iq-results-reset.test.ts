import { test } from 'node:test';
import assert from 'node:assert/strict';
import { afterIQReset, combineCutoffs } from '../../../src/lib/iq-results-reset.ts';
test('reset hides only October 21 entries up to the reset and preserves previous BRT days', () => {
  const cutoff = '2026-10-21T18:27:00Z';
  assert.equal(afterIQReset('2026-10-20T18:00:00Z', cutoff), true);
  assert.equal(afterIQReset('2026-10-21T02:59:59Z', cutoff), true);
  assert.equal(afterIQReset('2026-10-21T03:00:00Z', cutoff), false);
  assert.equal(afterIQReset('2026-10-21T18:26:59Z', cutoff), false);
  assert.equal(afterIQReset(cutoff, cutoff), false);
  assert.equal(afterIQReset('2026-10-21T18:27:01Z', cutoff), true);
  assert.equal(afterIQReset('2026-10-22T03:00:00Z', cutoff), true);
  assert.equal(afterIQReset('2026-10-17T00:05:00Z', ''), true);
});
test('global server cutoff and per-user cutoff combine to the latest reset', () => {
  assert.equal(combineCutoffs('2026-10-21T17:00:00Z', '2026-10-21T18:00:00Z'), '2026-10-21T18:00:00Z');
  assert.equal(combineCutoffs('', '2026-10-21T18:00:00Z'), '2026-10-21T18:00:00Z');
  assert.equal(combineCutoffs('2026-10-21T19:00:00Z', ''), '2026-10-21T19:00:00Z');
  assert.equal(combineCutoffs('', ''), '');
  assert.equal(afterIQReset('2026-10-21T17:59:00Z', combineCutoffs('', '2026-10-21T18:00:00Z')), false);
  assert.equal(afterIQReset('2026-10-21T18:01:00Z', combineCutoffs('', '2026-10-21T18:00:00Z')), true);
});