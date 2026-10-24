import { expect, test } from 'bun:test';
import { chartFeatures, chooseDemoCandidate, demoPreferredPatternAllowed, demoPreferredPatternDistance, demoPreferredScore, type DemoCandidate } from './demo-continuation';
import { isSuperSelected } from './demo-validated';

const candidate = (score: number, distance = Infinity): DemoCandidate => ({
  signal_id: `candidate-${score}`, asset: 'X-OTC', direction: 'PUT', entry_strategy: 'TENDENCIA',
  created_at: '2026-10-24T22:04:00Z', _score: score, _preferredPatternDistance: distance,
});
test('preferred Demo scores are exactly the eight user-selected displayed notes', () => {
  for (const score of [2.26,2.23,2.18,2.64,2.88,2.03,2.69,2.91]) expect(demoPreferredScore(score)).toBe(true);
  for (const score of [2.25,2.27,2.65,2.9,4.2,NaN]) expect(demoPreferredScore(score)).toBe(false);
  expect(demoPreferredScore(2.264)).toBe(true);
});
test('exact 2.26 keeps first priority and only that score authorizes principal', () => {
  expect(chooseDemoCandidate([candidate(2.23,0),candidate(2.26,1)],true)?._score).toBe(2.26);
  for (const score of [2.23,2.18,2.64,2.88,2.03,2.69,2.91,4.2]) expect(isSuperSelected(score)).toBe(false);
  expect(isSuperSelected(2.26)).toBe(true);
});
test('selected exact notes outrank unselected higher or nearer notes without changing scores', () => {
  const preferred = candidate(2.88,0.2);
  expect(chooseDemoCandidate([candidate(4.2,0),candidate(2.25,0),preferred],true)).toEqual(preferred);
  expect(preferred._score).toBe(2.88);
});
test('among selected notes choose the closest winning chart, not the highest score', () => {
  expect(chooseDemoCandidate([candidate(2.91,0.8),candidate(2.18,0.1)],true)?._score).toBe(2.18);
});
test('winning selected-note charts prioritize other eligible signals over unmatched shapes', () => {
  expect(chooseDemoCandidate([candidate(2.25,2),candidate(3,0.1)],true)?._score).toBe(3);
});
test('cohort references exclude losses and wins outside selected scores', () => {
  const samples = [{f:[0,0],result:'loss',score:2.26},{f:[0,0],result:'win',score:4.2},
    {f:[0.3,0.4],result:'win',score:2.23}];
  expect(demoPreferredPatternDistance(samples,[0,0])).toBeCloseTo(0.5);
  expect(demoPreferredPatternDistance(samples.slice(0,2),[0,0])).toBe(Infinity);
  expect(demoPreferredPatternDistance(samples,null)).toBe(Infinity);
});
test('result and following candles cannot change the matching features', () => {
  const entry = 180000;
  const closed = Array.from({length:20},(_,i)=>({t:entry-(20-i)*60,o:100,c:99,h:101,l:98}));
  const f = chartFeatures(closed,entry,'PUT');
  expect(f).not.toBeNull();
  expect(chartFeatures([...closed,{t:entry,o:99,c:500,h:500,l:1}],entry,'PUT')).toEqual(f);
});
test('blocks every candidate without eight-score chart correspondence, even exact 2.26', () => {
  expect(chooseDemoCandidate([candidate(2.26),candidate(2.23,1.31),candidate(5.19),candidate(3.18,NaN)],true)).toBeNull();
  expect(demoPreferredPatternAllowed(undefined)).toBe(false);
  expect(demoPreferredPatternAllowed(Infinity)).toBe(false);
  expect(demoPreferredPatternAllowed(-1)).toBe(false);
  expect(demoPreferredPatternAllowed(1.3)).toBe(true);
});
test('retains a matched candidate but never falls back to an unmatched exact note', () => {
  expect(chooseDemoCandidate([candidate(2.26),candidate(3.18,0.8)],true)?._score).toBe(3.18);
  expect(chooseDemoCandidate([],true)).toBeNull();
});