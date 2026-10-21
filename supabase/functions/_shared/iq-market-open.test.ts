import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { iqMarketOpen } from './iq-market-open.ts';
const now = Date.parse('2026-10-21T18:39:00Z') / 1000;
const asset = { name: 'front.EURUSD', enabled: true, is_suspended: false, schedule: [[now - 100, now + 120]], option: { start_time: now - 60, expiration_times: [60] } };
test('requires live schedule covering analysis and expiry', () => assert.equal(iqMarketOpen(asset, now, now + 60), true));
test('JAPAN225:N enabled but closed schedule is not available', () => {
  assert.equal(iqMarketOpen({ ...asset, schedule: [[now - 7200, now - 3600]] }, now, now + 60), false);
});
test('JAPAN225:N reported unavailable stays quarantined even if broker marks enabled', () => {
  assert.equal(iqMarketOpen({ ...asset, name: 'front.JAPAN225:N' }, now, now + 60), false);
});
test('requires one-minute expiry; option start_time is not assumed to mean market opening', () => {
  assert.equal(iqMarketOpen({ ...asset, option: { start_time: now + 60, expiration_times: [60] } }, now, now + 60), true);
  assert.equal(iqMarketOpen({ ...asset, option: { start_time: now - 60, expiration_times: [900] } }, now, now + 60), false);
  assert.equal(iqMarketOpen({ ...asset, option: undefined }, now, now + 60), false);
});
test('missing schedule suspension confirmation or enabled flag fails closed', () => {
  assert.equal(iqMarketOpen({ ...asset, schedule: undefined }, now, now + 60), false);
  assert.equal(iqMarketOpen({ ...asset, is_suspended: undefined }, now, now + 60), false);
  assert.equal(iqMarketOpen({ ...asset, is_suspended: true }, now, now + 60), false);
  assert.equal(iqMarketOpen({ ...asset, enabled: false }, now, now + 60), false);
});
test('future intervals and market closing before expiration reject', () => {
  assert.equal(iqMarketOpen({ ...asset, schedule: [[now + 1, now + 120]] }, now, now + 60), false);
  assert.equal(iqMarketOpen({ ...asset, schedule: [[now - 100, now + 59]] }, now, now + 60), false);
  assert.equal(iqMarketOpen(asset, now + 120, now + 180), false);
});
test('bad schedule values rejected without timezone or millisecond guesses', () => {
  for (const schedule of [[], [[String(now), now + 120]], [[now * 1000, (now + 120) * 1000]], { open: true }])
    assert.equal(iqMarketOpen({ ...asset, schedule }, now, now + 60), false);
});