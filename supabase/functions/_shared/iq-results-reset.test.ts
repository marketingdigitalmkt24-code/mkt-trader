import { test } from 'node:test';
import assert from 'node:assert/strict';
import { afterIQReset } from '../../../src/lib/iq-results-reset.ts';
test('reset excludes prior IQ results but counts new ones', () => {
  assert.equal(afterIQReset('2026-10-17T00:05:00Z', '2026-10-17T00:06:00Z'), false);
  assert.equal(afterIQReset('2026-10-17T00:07:00Z', '2026-10-17T00:06:00Z'), true);
  assert.equal(afterIQReset('2026-10-17T00:05:00Z', ''), true);
});