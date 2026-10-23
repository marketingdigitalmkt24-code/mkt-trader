import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { forceFormingObservation, forceFormingOpenObservation, forceFormingConfirmation } from './force-forming-test.ts';
import { anticipationResult } from './force-anticipation-test.ts';
const minute = 1792735200;
const history = () => Array.from({ length: 100 }, (_, i) => ({ t: minute - (100-i)*60, o: 100, c: 101, h: 101, l: 100 }));
const current = { t: minute, o: 100, c: 103, h: 103, l: 100 };
const market = { name: 'front.USDBRL-OTC', enabled: true, is_suspended: false,
  schedule: [[minute, minute + 120]], option: { expiration_times: [60] } };
test('observation starts at :00 and keeps actual detection time and quote', () => {
  assert.equal(forceFormingOpenObservation('USD/BRL-OTC', [...history(), {...current,c:100}], minute, [market], minute), null);
  const out = forceFormingOpenObservation('USD/BRL-OTC', [...history(), current], minute + 15, [market], minute);
  assert.ok(out);
  assert.equal(out.indicators.observationStartedAt, new Date(minute * 1000).toISOString());
  assert.equal(out.created_at, new Date((minute + 15) * 1000).toISOString());
  assert.equal(out.entry_price, 103);
  assert.equal(out.indicators.mode, 'TEST_ONLY');
});
test('forming TEST requires asset open at operation time through expiration', () => {
  const run = (m: typeof market) => forceFormingOpenObservation('USD/BRL-OTC', [...history(), current], minute + 15, [m], minute);
  assert.ok(run(market));
  assert.equal(run({...market, enabled:false}), null);
  assert.equal(run({...market, is_suspended:true}), null);
  assert.equal(run({...market, schedule:[]}), null);
  assert.equal(run({...market, schedule:[[minute,minute+14]]}), null);
  assert.equal(run({...market, schedule:[[minute,minute+59]]}), null);
  assert.equal(run({...market, option:{expiration_times:[900]}}), null);
});
test('a missed observation minute cannot roll forward or backdate', () => {
  assert.equal(forceFormingOpenObservation('A', [...history(),current], minute + 15, [market], minute - 60), null);
  assert.equal(forceFormingOpenObservation('A', [...history(),current], minute - 1, [market], minute), null);
});
test('observes CALL on the forming Force minute, before next-minute closed signal, without using opening price', () => {
  const out = forceFormingObservation('USD/BRL-OTC', [...history(), current], minute+15);
  assert.ok(out); assert.equal(out.direction, 'CALL'); assert.equal(out.entry_price, 103);
  assert.equal(out.created_at, new Date((minute+15)*1000).toISOString());
  assert.equal(out.indicators.expectedForceSignalMinute, new Date((minute+60)*1000).toISOString());
  assert.equal(out.indicators.mode, 'TEST_ONLY');
});
test('PUT mirrors forming body and needs no RSI, volume or first pullback', () => {
  const out = forceFormingObservation('TRON-OTC', [...history(), { ...current, c: 97, h: 100, l: 97 }], minute+30);
  assert.equal(out?.direction, 'PUT'); assert.equal(out?.entry_price, 97);
});
test('same closed Force threshold: strictly greater than twice previous 20 mean bodies', () => {
  assert.equal(forceFormingObservation('A', [...history(), {...current, c:102}], minute+15), null);
  assert.ok(forceFormingObservation('A', [...history(), {...current, c:102.01}], minute+15));
});
test('future Force and closed candles cannot backdate an entry', () => {
  assert.equal(forceFormingObservation('A', history(), minute+15), null);
  assert.equal(forceFormingObservation('A', [...history(), current], minute+60), null);
  assert.equal(forceFormingObservation('A', [...history(), current], minute+50), null);
  const base = forceFormingObservation('A', [...history(), current], minute+15);
  assert.deepEqual(forceFormingObservation('A', [...history(), current, {...current,t:minute+60,c:999,h:999}],minute+15),base);
});
test('100 contiguous valid bars and a valid current quote required', () => {
  assert.equal(forceFormingObservation('A', [...history().slice(1), current], minute+15), null);
  assert.equal(forceFormingObservation('A', [...history(), {...current,c:NaN}], minute+15), null);
});
test('same asset/minute deduplicates even if later observation reverses direction', () => {
  const first = forceFormingObservation('A', [...history(), current], minute+15);
  const next = forceFormingObservation('A', [...history(), {...current,c:97,h:100,l:97}], minute+30);
  assert.equal(first?.signal_id, next?.signal_id);
});
test('failed Force confirmations remain losses in the sample, not filtered away', () => {
  const out = forceFormingObservation('A', [...history(), current],minute+15);
  assert.ok(out);
  const final = {...current,c:101};
  assert.equal(forceFormingConfirmation(out.indicators,'CALL',final).forceConfirmed,false);
  assert.equal(anticipationResult(out,[final],minute+60)?.profit,-10);
  assert.equal(forceFormingConfirmation(out.indicators,'CALL',{...current,c:104,h:104}).forceConfirmed,true);
  assert.equal(anticipationResult(out,[{...current,c:104,h:104}],minute+60)?.profit,8.5);
});