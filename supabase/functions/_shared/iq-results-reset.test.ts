import { test } from 'node:test';
import assert from 'node:assert/strict';
import { afterIQReset, combineCutoffs } from '../../../src/lib/iq-results-reset.ts';
test('reset excludes prior IQ results but counts new ones', () => {
  assert.equal(afterIQReset('2026-10-17T00:05:00Z', '2026-10-17T00:06:00Z'), false);
  assert.equal(afterIQReset('2026-10-17T00:07:00Z', '2026-10-17T00:06:00Z'), true);
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