import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { ANTICIPATION_RULE, ANTICIPATION_RULE_V2, anticipationObservation, anticipationSetup, anticipationResult, type AnticipationCandle } from './force-anticipation-test.ts';
const minute = 1792608000;
function fixture(): AnticipationCandle[] {
  let close = 100;
  const cs = Array.from({ length: 100 }, (_, i) => {
    close += i % 2 === 0 ? 0.12 : -0.10;
    const o = close - 0.20;
    return { t: minute - (100 - i) * 60, o, c: close, h: close + 0.10, l: o - 0.10, v: 100 };
  });
  const last = cs[99];
  last.o = last.c + 0.02; last.h = last.o + 0.10; last.l = last.c - 0.10; last.v = 120;
  return cs;
}
test('CALL after first small red candle with averages RSI and reported volume', () => {
  const out = anticipationSetup(fixture(), minute);
  assert.ok(out); assert.ok(out.ema9 > out.ema21 && out.ema21 > out.sma50);
  assert.ok(out.rsi >= 45 && out.rsi <= 65); assert.equal(out.volumeRatio, 1.2);
});
function putFixture() {
  return fixture().map(k => ({ ...k, o: 300 - k.o, c: 300 - k.c, h: 300 - k.l, l: 300 - k.h }));
}
test('PUT mirrors CALL after first small green candle with descending averages RSI 35 to 55 and volume', () => {
  const out = anticipationSetup(putFixture(), minute);
  assert.ok(out); assert.equal(out.direction, 'PUT');
  assert.ok(out.ema9 < out.ema21 && out.ema21 < out.sma50);
  assert.ok(out.rsi >= 35 && out.rsi <= 55); assert.equal(out.volumeRatio, 1.2);
  const call = anticipationSetup(fixture(), minute);
  assert.ok(call); assert.equal(call.direction, 'CALL');
  assert.ok(Math.abs(out.rsi + call.rsi - 100) < 1e-8);
});
test('PUT rejects second green candle and large countertrend body', () => {
  const cs = putFixture(); cs[98].o = cs[98].c - 0.01;
  assert.equal(anticipationSetup(cs, minute), null);
  const large = putFixture(); large[99].o = large[99].c - 0.19; large[99].l = large[99].o - 0.1;
  assert.equal(anticipationSetup(large, minute), null);
});
test('PUT requires reported volume and closed contiguous candles', () => {
  for (const v of [undefined, 0, 49]) {
    const cs = putFixture(); cs[99].v = v;
    assert.equal(anticipationSetup(cs, minute), null);
  }
  assert.equal(anticipationSetup(putFixture().slice(1), minute), null);
  const cs = putFixture();
  assert.deepEqual(anticipationSetup([...cs, { t: minute, o: 100, c: 1, h: 100, l: 1, v: 1e9 }], minute), anticipationSetup(cs, minute));
});
test('PUT observation uses observed quote and same minute expiration', () => {
  const out = anticipationObservation('TRON-OTC', [...putFixture(), { t: minute, o: 201, c: 200, h: 201, l: 200, v: 2 }], minute + 12);
  assert.ok(out); assert.equal(out.direction, 'PUT'); assert.equal(out.entry_price, 200);
  assert.equal(out.expiration_time, new Date((minute + 60) * 1000).toISOString());
});
test('PUT settlement inverts outcome with 10 stake and 85 percent payout', () => {
  const entry = { entry_minute: new Date(minute * 1000).toISOString(), entry_price: 101, direction: 'PUT' };
  const candle = { t: minute, o: 101, c: 100, h: 102, l: 100 };
  assert.equal(anticipationResult(entry, [candle], minute + 59), null);
  assert.equal(anticipationResult(entry, [candle], minute + 60)?.profit, 8.5);
  assert.equal(anticipationResult(entry, [{ ...candle, c: 102 }], minute + 60)?.profit, -10);
  assert.equal(anticipationResult(entry, [{ ...candle, c: 101 }], minute + 60)?.profit, 0);
  assert.equal(anticipationResult({ ...entry, direction: 'INVALID' }, [candle], minute + 60), null);
});
test('second red candle does not trigger', () => {
  const cs = fixture(); cs[98].o = cs[98].c + 0.01;
  assert.equal(anticipationSetup(cs, minute), null);
});
test('large red body does not trigger', () => {
  const cs = fixture(); cs[99].o = cs[99].c + 0.19; cs[99].h = cs[99].o + 0.1;
  assert.equal(anticipationSetup(cs, minute), null);
});
test('missing zero or insufficient volume blocks rather than inventing volume', () => {
  for (const v of [undefined, 0, 49]) {
    const cs = fixture(); cs[99].v = v;
    assert.equal(anticipationSetup(cs, minute), null);
  }
});
test('100 contiguous closed candles required; future candle cannot confirm setup', () => {
  const cs = fixture(); assert.equal(anticipationSetup(cs.slice(1), minute), null);
  const expected = anticipationSetup(cs, minute);
  assert.deepEqual(anticipationSetup([...cs, { t: minute, o: 1, c: 1000, h: 1000, l: 1, v: 1e9 }], minute), expected);
});
test('observation uses current quote not past opening and expires in same minute', () => {
  const cs = [...fixture(), { t: minute, o: 100, c: 101, h: 101, l: 100, v: 2 }];
  const out = anticipationObservation('AMA/ZON', cs, minute + 12);
  assert.ok(out); assert.equal(out.direction, 'CALL'); assert.equal(out.entry_price, 101);
  assert.equal(out.created_at, new Date((minute + 12) * 1000).toISOString());
  assert.equal(out.expiration_time, new Date((minute + 60) * 1000).toISOString());
  assert.equal(anticipationObservation('AMA/ZON', cs, minute + 31), null);
});
test('does not enter with a missing live quote', () => assert.equal(anticipationObservation('AMA/ZON', fixture(), minute + 5), null));
test('broader v3 accepts larger first pullback rejected by v2, CALL and PUT', () => {
  const cs = fixture(); cs[99].o = cs[99].c + 0.15; cs[99].h = cs[99].o + 0.06; cs[99].l = cs[99].c - 0.06;
  const put = cs.map(k => ({ ...k, o: 300-k.o, c: 300-k.c, h: 300-k.l, l: 300-k.h }));
  for (const bars of [cs, put]) {
    assert.equal(anticipationSetup(bars, minute, ANTICIPATION_RULE_V2), null);
    assert.equal(anticipationSetup(bars, minute)?.ruleVersion, 3);
  }
});
test('v3 reported volume floor is half the previous 20-bar mean', () => {
  const cs = fixture(); cs[99].v = 50;
  assert.equal(anticipationSetup(cs, minute)?.volumeRatio, 0.5);
  assert.equal(anticipationSetup(cs, minute, ANTICIPATION_RULE_V2), null);
  cs[99].v = 49.99; assert.equal(anticipationSetup(cs, minute), null);
});
test('broader RSI window accepts trend momentum rejected by v2', () => {
  const cs = fixture();
  for (const k of cs) { k.c += (k.t - cs[0].t) / 60 * 0.018; k.o += (k.t - cs[0].t) / 60 * 0.018; k.h += (k.t - cs[0].t) / 60 * 0.018; k.l += (k.t - cs[0].t) / 60 * 0.018; }
  const out = anticipationSetup(cs, minute);
  assert.ok(out); assert.ok(out.rsi > 65 && out.rsi <= 75);
  assert.equal(anticipationSetup(cs, minute, ANTICIPATION_RULE_V2), null);
});
test('broader version does not admit countertrend averages', () => {
  const cs = putFixture(); cs[99].o = cs[99].c + 0.02; cs[99].h = cs[99].o + 0.1; cs[99].l = cs[99].c - 0.1; cs[98].o = cs[98].c - 0.02;
  assert.equal(anticipationSetup(cs, minute), null);
});
test('new observations identify v3 without rewriting older signals', () => {
  const out = anticipationObservation('TRON-OTC', [...fixture(), { t: minute, o: 100, c: 101, h: 101, l: 100, v: 2 }], minute + 1);
  assert.equal(out?.signal_id, `anticipation-v3-TRON-OTC-${minute}`);
  assert.equal(ANTICIPATION_RULE.bodyShareMax, 0.65); assert.equal(ANTICIPATION_RULE.bodyMeanMax, 0.85);
  assert.equal(ANTICIPATION_RULE.rsiMin, 40); assert.equal(ANTICIPATION_RULE.rsiMax, 75);
});
test('settles exact entry minute only after close with simulated 10 stake and 85% payout', () => {
  const entry = { entry_minute: new Date(minute * 1000).toISOString(), entry_price: 101 };
  const candle = { t: minute, o: 100, c: 102, h: 102, l: 100 };
  assert.equal(anticipationResult(entry, [candle], minute + 59), null);
  assert.equal(anticipationResult(entry, [{ ...candle, t: minute + 60 }], minute + 120), null);
  assert.equal(anticipationResult(entry, [candle], minute + 60)?.profit, 8.5);
  assert.equal(anticipationResult(entry, [{ ...candle, c: 100 }], minute + 60)?.profit, -10);
  assert.equal(anticipationResult(entry, [{ ...candle, c: 101 }], minute + 60)?.profit, 0);
});