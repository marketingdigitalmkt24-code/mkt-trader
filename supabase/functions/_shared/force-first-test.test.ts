import { test } from 'node:test';
import assert from 'node:assert/strict';
import { forceFirstObservation, FORCE_FIRST_TEST } from './force-first-test.ts';
import { closedTestResult } from './test-candle-result.ts';
const entry = 1792476000;
const base = { signal_id: 't7-ASSET-VELA_FORCA-1792476000', asset: 'ASSET', direction: 'CALL', entry_strategy: 'VELA_FORCA', timeframe: 'TEST', created_at: new Date(entry * 1000).toISOString(), expiration_time: new Date((entry + 60) * 1000).toISOString(), entry_price: 11, result: 'test7_open', profit: 0 };
const candles = () => Array.from({ length: 21 }, (_, i) => ({ t: entry - (21 - i) * 60, o: i === 20 ? 10 : 11, c: i === 20 ? 11 : 10.8, h: 12, l: 9 }));
test('first direction without breakout creates only separate TEST, without body90 requirement', () => {
  const original = { ...base };
  const row = forceFirstObservation(base, candles());
  assert.equal(row?.entry_strategy, FORCE_FIRST_TEST);
  assert.equal(row?.timeframe, 'TEST');
  assert.equal(row?.telegram_sent, false);
  assert.equal(row?.test_sequence_strategy, null);
  assert.equal(row?.is_auto_trade, false);
  assert.equal(row?.signal_id, `study-force-first-${base.signal_id}`);
  assert.deepEqual(base, original);
});
test('CALL above high20 excluded, equality allowed', () => {
  const cs = candles(); cs[20] = { ...cs[20], c: 12.1, h: 12.1 };
  assert.equal(forceFirstObservation(base, cs), null);
  cs[20].c = 12; assert.ok(forceFirstObservation(base, cs));
});
test('PUT below low20 excluded, first red within range accepted', () => {
  const cs = candles().map(k => ({ ...k, o: k.c, c: k.o }));
  assert.ok(forceFirstObservation({ ...base, direction: 'PUT' }, cs));
  cs[20] = { ...cs[20], c: 8.9, l: 8.9 };
  assert.equal(forceFirstObservation({ ...base, direction: 'PUT' }, cs), null);
});
test('second same-direction excluded, preceding doji allowed', () => {
  const cs = candles(); cs[19].c = 11.2;
  assert.equal(forceFirstObservation(base, cs), null);
  cs[19].c = cs[19].o; assert.ok(forceFirstObservation(base, cs));
});
test('force exceeds twice mean, contiguous21 closed bars required', () => {
  const cs = candles(); cs[20].c = 10.1;
  assert.equal(forceFirstObservation(base, cs), null);
  assert.equal(forceFirstObservation(base, candles().slice(1)), null);
  const future = candles(); future[20].t = entry;
  assert.equal(forceFirstObservation(base, future), null);
});
test('other strategies and real rows excluded, 1m TEST settles +8.5 or -10', () => {
  assert.equal(forceFirstObservation({ ...base, timeframe: 'M1' }, candles()), null);
  assert.equal(forceFirstObservation({ ...base, entry_strategy: 'TENDENCIA' }, candles()), null);
  assert.equal(closedTestResult([{ t: entry, o: 10, c: 11 }], entry, 'CALL', entry + 59), null);
  assert.equal(closedTestResult([{ t: entry, o: 10, c: 11 }], entry, 'CALL', entry + 60)?.profit, 8.5);
  assert.equal(closedTestResult([{ t: entry, o: 10, c: 9 }], entry, 'CALL', entry + 60)?.profit, -10);
});