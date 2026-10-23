import { test, expect, describe, it } from 'bun:test';
import { demoCeiling, demoLearningAdjustment, chartFeatures, chartPatternAdjustment, similarToReference, DEMO_REFERENCE_MAX_DISTANCE } from './demo-continuation';
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
});
describe('demoCeiling', () => {
 const entry = 6000*60;
 const base = () => Array.from({length:100},(_,i)=>({t:entry-(100-i)*60,o:100,c:100.1,h:100.2,l:99.9}));
 it('PUT when green returns to red top', () => {
  const cs=base(); cs[98]={...cs[98],o:110,c:100,h:110.2,l:99.8}; cs[99]={...cs[99],o:100,c:110,h:110.3,l:99.9};
  expect(demoCeiling(cs,entry)?.direction).toBe('PUT');
  cs[99]={...cs[99],c:105,h:105.1}; expect(demoCeiling(cs,entry)).toBeNull();
 });
});
describe('demoLearningAdjustment', () => {
 it('favors strategy winning at the same BRT hour and penalizes losing one', () => {
  const at = Date.parse('2026-10-23T19:10:00Z');
  const h = (s: string, r: string) => ({ entry_strategy: s, entry_minute: '2026-10-22T19:05:00Z', result: r, profit: 0 });
  const hist = [...Array(5)].flatMap(() => [h('A','win'), h('B','loss')]);
  expect(demoLearningAdjustment(hist,'A',at)).toBeGreaterThan(0.9);
  expect(demoLearningAdjustment(hist,'B',at)).toBeLessThan(-0.9);
  expect(demoLearningAdjustment(hist,'C',at)).toBe(0);
 });
});
describe('chart pattern learning', () => {
 const entry = 6000*60;
 const mk = (up: boolean) => Array.from({length:21},(_,i)=>({t:entry-(20-i)*60,o:100,c:up?101:99,h:101.2,l:98.8}));
 it('ignores the result candle and learns similar shapes', () => {
  const a = chartFeatures(mk(true),entry,'CALL');
  if (!a) throw new Error('missing bullish features');
  expect(chartFeatures([...mk(true),{t:entry,o:1,c:500,h:500,l:1}],entry,'CALL')).toEqual(a);
  const b = chartFeatures(mk(false),entry,'CALL');
  if (!b) throw new Error('missing bearish features');
  const samples = [...Array(4)].flatMap(() => [{f:a,result:'win'},{f:b,result:'loss'}]);
  expect(chartPatternAdjustment(samples,a)).toBeGreaterThan(0);
  expect(chartPatternAdjustment(samples,b)).toBeLessThan(0);
  expect(chartPatternAdjustment(samples.slice(0,2),a)).toBe(0);
 });
});

test('wider GEV tolerance accepts formerly rejected shapes without removing the minimum', () => {
  const ref = Array(21).fill(0.2);
  const newlyEligible = ref.map(v => v + 0.25);
  expect(DEMO_REFERENCE_MAX_DISTANCE).toBe(1.3);
  expect(similarToReference(ref, newlyEligible, 0.9)).toBe(false);
  expect(similarToReference(ref, newlyEligible)).toBe(true);
});
test('reference filter rejects missing or distant charts', () => {
  const ref = Array(21).fill(0.2);
  expect(similarToReference(ref, ref.map(v => v + 0.1))).toBe(true);
  expect(similarToReference(ref, ref.map(v => v + 0.5))).toBe(false);
  expect(similarToReference(null, ref)).toBe(false);
  expect(similarToReference(ref, null)).toBe(false);
  expect(similarToReference(ref, [0.2])).toBe(false);
});
