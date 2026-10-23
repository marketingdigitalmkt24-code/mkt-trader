import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { combinedStrategies, combinedTestObservations, type StrategyFire } from './combined-strategy-tests.ts';
import { anticipationResult } from './force-anticipation-test.ts';
const minute = 1792735200;
const market = {name:'front.EURUSD',enabled:true,is_suspended:false,schedule:[[minute,minute+120]],option:{expiration_times:[60]}};
const candles = Array.from({length:82},(_,i)=>({t:minute-(81-i)*60,o:100,c:101,h:102,l:99}));
test('Ichimoku and Force require same direction on the same observation',()=>{
  assert.deepEqual(combinedStrategies([['ICHIMOKU','CALL'],['VELA_FORCA','CALL']]),[['TEST_ICHIMOKU_FORCA_V1','CALL']]);
  assert.deepEqual(combinedStrategies([['ICHIMOKU','CALL'],['VELA_FORCA','PUT']]),[]);
  assert.deepEqual(combinedStrategies([['ICHIMOKU','CALL']]),[]);
});
test('KDJ RSI combines mirrored PUT and CALL without changing components',()=>{
  for(const d of ['CALL','PUT'] as const){
    const fired:StrategyFire[]=[['KDJ',d],['REVERSAO_RSI',d]];
    assert.deepEqual(combinedStrategies(fired),[['TEST_KDJ_RSI_V1',d]]);
    assert.equal(fired[0][0],'KDJ');
  }
});
test('comparison records combo and individual references as isolated TEST only',()=>{
  const rows=combinedTestObservations('EUR/USD',candles,[['ICHIMOKU','CALL'],['VELA_FORCA','CALL']],minute,minute+5,[market]);
  assert.equal(rows.length,3);
  assert.equal(rows[0].indicators.strategy,'TEST_ICHIMOKU_FORCA_V1');
  assert.equal(rows[0].entry_price,101);
  assert.equal(rows[0].created_at,new Date((minute+5)*1000).toISOString());
  assert.ok(rows.every(r=>r.signal_id.startsWith('combo-test-v1-')&&r.indicators.mode==='TEST_ONLY'));
  assert.equal(anticipationResult(rows[0],[{...candles[81],c:102}],minute+60)?.profit,8.5);
});
test('no closed market, stale entry, missing quote or noncontiguous history',()=>{
  const run=(cs=candles,now=minute+5,markets=[market])=>combinedTestObservations('A',cs,[['KDJ','CALL'],['REVERSAO_RSI','CALL']],minute,now,markets);
  assert.deepEqual(run(candles,minute+31),[]);
  assert.deepEqual(run(candles,minute+5,[{...market,enabled:false}]),[]);
  assert.deepEqual(run(candles.slice(0,-1)),[]);
  assert.deepEqual(run(candles.slice(1)),[]);
});