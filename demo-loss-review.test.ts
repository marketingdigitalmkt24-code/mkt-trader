import {expect,test} from 'bun:test';
import {lossReview,readLossCandles} from './src/lib/demo-loss-review';
const candles=[{t:60,o:100,c:99,h:101,l:98},{t:120,o:99,c:101,h:102,l:98},{t:180,o:101,c:102,h:103,l:100}];
test('TESLA raw 2.259 is not exact authorized 2.26',()=>{
 expect(lossReview(candles,120,'PUT',2.259004451962,240).roundedOnly).toBe(true);
 expect(lossReview(candles,120,'PUT',2.26,240).roundedOnly).toBe(false);
});
test('each of fourteen released notes requires raw equality',()=>{
 for(const score of [2.26,2.23,2.18,2.64,2.88,2.03,2.69,2.91,2.04,2.61,2.78,2.37,2.76,2.20]) {
  expect(lossReview([],120,'PUT',score,240).roundedOnly).toBe(false);
  expect(lossReview([],120,'PUT',score-0.001,240).roundedOnly).toBe(true);
 }
});
test('closed rising result contradicts PUT, not CALL',()=>{
 expect(lossReview(candles,120,'PUT',2.26,180).comparison?.agrees).toBe(false);
 expect(lossReview(candles,120,'CALL',2.26,180).comparison?.agrees).toBe(true);
});
test('unclosed and missing result never prove candle failure',()=>{
 expect(lossReview(candles,120,'PUT',null,179).comparison).toBeNull();
 expect(lossReview([],120,'PUT',null,240).comparison).toBeNull();
 expect(lossReview(candles,120,'PUT',null,240).before.map(c=>c.t)).toEqual([60]);
});
test('invalid candle snapshots do not fabricate a chart',()=>{
 expect(readLossCandles(null)).toEqual([]);
 expect(readLossCandles([{t:0,o:NaN,c:1,h:2,l:0},candles[0]])).toEqual([candles[0]]);
});