import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { forceFormingPageRange } from './force-forming-pagination';

test('forming operations show exactly 20 per page without overlap', () => {
  assert.deepEqual(forceFormingPageRange(1), [0, 19]);
  assert.deepEqual(forceFormingPageRange(2), [20, 39]);
  assert.deepEqual(forceFormingPageRange(3), [40, 59]);
});