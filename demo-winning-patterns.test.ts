import { test,expect } from 'bun:test';
import { preEntryCandles,winningPatterns,patternDistance,DEMO_ANALYSIS_SCORE_CENTS,DEMO_VISIBLE_PATTERN_SCORES } from './src/lib/demo-winning-patterns';
const entry='2026-10-24T23:00:00Z';
const t=Date.parse(entry)/1000;
const candles=Array.from({length:22},(_,i)=>({t:t+(i-20)*60,o:100+i,c:101+i,h:102+i,l:99+i}));
test('comparison excludes result candle and subsequent candle',()=>{expect(preEntryCandles(candles,entry)).toHaveLength(20);expect(preEntryCandles(candles,entry).every(c=>c.t<t)).toBe(true);});
test('references require confirmed WIN and one of the eight displayed scores',()=>{
 const c={signal_id:'a',entry_minute:entry,direction:'CALL',asset:'A',entry_strategy:'TENDENCIA',score:2.26,candles};
 const o={signal_id:'a',result:'win',status:'confirmed',iq_option_id:'123'};
 expect(winningPatterns([c],[o])).toHaveLength(1);
 expect(winningPatterns([{...c,score:2.27}],[o])).toHaveLength(0);
 expect(winningPatterns([c],[{...o,result:'loss'}])).toHaveLength(0);
 expect(winningPatterns([c],[{...o,status:'pending'}])).toHaveLength(0);
});
test('comparison does not use future outcome',()=>{const pre=preEntryCandles(candles,entry);expect(patternDistance(pre,entry,'CALL',preEntryCandles([...candles.slice(0,20),{...candles[20],c:999}],entry),entry,'CALL')).toBe(0);});
test('six additional notes now provide Demo winning references',()=>{
 expect([...DEMO_ANALYSIS_SCORE_CENTS]).toEqual([]);
 for(const score of [2.04,2.61,2.78,2.37,2.76,2.20]){
  const c={signal_id:'a',entry_minute:entry,direction:'CALL',asset:'A',entry_strategy:'TENDENCIA',score,candles};
  const o={signal_id:'a',result:'win',status:'confirmed',iq_option_id:'123'};
  expect(winningPatterns([c],[o],DEMO_VISIBLE_PATTERN_SCORES)).toHaveLength(1);
  expect(winningPatterns([c],[o])).toHaveLength(1);
 }
});