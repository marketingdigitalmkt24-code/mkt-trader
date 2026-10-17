import { test } from 'node:test';
import assert from 'node:assert/strict';
import { closedTestResult, prioritizeResultAssets } from './test-candle-result.ts';

test('20:57 TEST result confirms at 20:58, never before candle closure', () => {
  const entry = Date.parse('2026-10-16T20:57:00-03:00') / 1000;
  const candles = [{ t: entry, o: 10, c: 11 }];
  assert.equal(closedTestResult(candles, entry, 'CALL', entry + 59), null);
  assert.equal(closedTestResult(candles, entry, 'CALL', entry + 60)?.result, 'win');
  assert.equal(closedTestResult(candles, entry, 'PUT', entry + 60)?.result, 'loss');
});
test('expired operation asset is fetched first without dropping other open assets', () => {
  assert.deepEqual(prioritizeResultAssets(new Map([['OTHER', 1], ['EXPIRED', 2], ['THIRD', 3]]), ['EXPIRED']), [['EXPIRED', 2], ['OTHER', 1], ['THIRD', 3]]);
});