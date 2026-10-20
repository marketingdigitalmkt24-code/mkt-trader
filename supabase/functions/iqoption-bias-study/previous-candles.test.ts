import { test } from 'node:test';
import assert from 'node:assert/strict';
import { previousCandles } from './previous-candles.ts';
import type { Candle } from './bias.ts';
const series = (): Candle[] => Array.from({length:100},(_,i)=>({t:i*60,o:100,c:100+(i%2 ? 0.1 : -0.1),h:101,l:99}));
test('entry candle and future extreme prices do not change past-only features',()=>{
 const cs=series(); const before=previousCandles(cs,6000,'CALL');
 cs.push({t:6000,o:100,c:99999,h:99999,l:1});
 assert.deepEqual(previousCandles(cs,6000,'CALL'),before);
 assert.equal(before.lastClosed,6000);
});
test('100 consecutive M1 candles required with no gap filling',()=>{
 const cs=series();cs.splice(50,1);assert.equal(previousCandles(cs,6000,'CALL').coverage,'MISSING');
 assert.equal(previousCandles(series().slice(1),6000,'CALL').coverage,'MISSING');
});
test('four preceding directional candles fail streak rule',()=>{
 const cs=series();cs[95].c=99.9;for(let i=96;i<100;i++)cs[i].c=100.1;
 assert.equal(previousCandles(cs,6000,'CALL').streak,4);
 assert.equal(previousCandles(cs,6000,'CALL').noLongStreak,false);
 assert.equal(previousCandles(cs,6000,'PUT').streak,0);
});
test('upper rejection wick greater than half range fails CALL only',()=>{
 const cs=series();cs[99]={t:5940,o:100,c:100.1,h:102,l:99.9};
 assert.equal(previousCandles(cs,6000,'CALL').noRejection,false);
 assert.equal(previousCandles(cs,6000,'PUT').noRejection,true);
});
test('extension above 1.5 true-range ATR is rejected',()=>{
 const cs=series();cs[99]={t:5940,o:100,c:110,h:111,l:99};
 const f=previousCandles(cs,6000,'CALL');assert.ok((f.extensionAtr ?? 0)>1.5);assert.equal(f.noExtension,false);
});