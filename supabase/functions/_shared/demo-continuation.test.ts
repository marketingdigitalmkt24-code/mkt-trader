import { test, expect } from 'bun:test';
import { demoContinuation, chooseDemoCandidate, DEMO_CONTINUATION } from './demo-continuation';
const entry = 1792783500;
function candles() {
 return Array.from({length:100},(_,i) => {
  const c=100-i*0.1;
  return {t:entry-(100-i)*60,o:c-0.02,c,h:c+0.1,l:c-0.1};
 }).map((k,i) => i===99 ? {...k,o:k.c+0.8,h:k.c+1,l:k.c} : k);
}
test('bearish continuation follows closed candle, never future winning candle',()=>{
 const cs=candles();expect(demoContinuation(cs,entry)?.direction).toBe('PUT');
 expect(demoContinuation([...cs,{t:entry,o:90,c:200,h:200,l:90}],entry)).toEqual(demoContinuation(cs,entry));
});
test('requires 100 contiguous closed candles',()=>{
 const cs=candles();expect(demoContinuation(cs.slice(1),entry)).toBeNull();
 expect(demoContinuation(cs.map((k,i)=>i===50?{...k,t:k.t-60}:k),entry)).toBeNull();
});
test('rejects bullish candle, weak body and lower rejection wick',()=>{
 const cs=candles();
 expect(demoContinuation(cs.map((k,i)=>i===99?{...k,o:k.c-0.1}:k),entry)).toBeNull();
 expect(demoContinuation(cs.map((k,i)=>i===99?{...k,h:k.c+2}:k),entry)).toBeNull();
 expect(demoContinuation(cs.map((k,i)=>i===99?{...k,l:k.c-1}:k),entry)).toBeNull();
});
test('rejects countertrend and fourth consecutive bearish candle',()=>{
 const cs=candles();
 expect(demoContinuation(cs.map(k=>({...k,o:200-k.o,c:200-k.c,h:200-k.l,l:200-k.h})),entry)).toBeNull();
 expect(demoContinuation(cs.map((k,i)=>i>=96?{...k,o:k.c+0.05,h:Math.max(k.h,k.c+0.05)}:k),entry)).toBeNull();
});
test('chooses one Demo winner without relabeling original candidate',()=>{
 const original={signal_id:'t7-A-TENDENCIA-1',asset:'A',direction:'CALL',entry_strategy:'TENDENCIA',created_at:new Date(entry*1000).toISOString(),_score:2};
 const pattern={...original,signal_id:'demo-continuation-v1-A-1',direction:'PUT',entry_strategy:DEMO_CONTINUATION,_score:2.8};
 expect(chooseDemoCandidate([original,pattern])).toEqual(pattern);
 expect(original.entry_strategy).toBe('TENDENCIA');
 expect(chooseDemoCandidate([original,{...pattern,_score:1}])).toEqual(original);
});import { demoCeiling } from './demo-continuation';
describe('demoCeiling', () => {
 const entry = 6000*60;
 const base = () => Array.from({length:100},(_,i)=>({t:entry-(100-i)*60,o:100,c:100.1,h:100.2,l:99.9}));
 it('PUT when green returns to red top', () => {
  const cs=base(); cs[98]={...cs[98],o:110,c:100,h:110.2,l:99.8}; cs[99]={...cs[99],o:100,c:110,h:110.3,l:99.9};
  expect(demoCeiling(cs,entry)?.direction).toBe('PUT');
  cs[99]={...cs[99],c:105,h:105.1}; expect(demoCeiling(cs,entry)).toBeNull();
 });
});
