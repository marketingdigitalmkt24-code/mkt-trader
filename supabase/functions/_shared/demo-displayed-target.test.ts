import { test, expect } from 'bun:test';
import { demoDisplayedTargetScore, chooseDemoCandidate } from './demo-continuation';

const candidate = (score: number, id = 'target') => ({signal_id:id,asset:'BIDU-OTC',direction:'CALL',entry_strategy:'TENDENCIA',created_at:'2026-10-25T02:00:00Z',_score:score});

test('Demo test accepts displayed 2.26 while retaining calculated precision', () => {
  expect(demoDisplayedTargetScore(2.26032894533026)).toBe(true);
  expect(demoDisplayedTargetScore(2.259)).toBe(true);
  expect(demoDisplayedTargetScore(2.26)).toBe(true);
  expect(demoDisplayedTargetScore(2.254)).toBe(false);
  expect(demoDisplayedTargetScore(2.266)).toBe(false);
  expect(demoDisplayedTargetScore(NaN)).toBe(false);
  expect(chooseDemoCandidate([candidate(2.26032894533026)],true,undefined,true)?._score).toBe(2.26032894533026);
});

test('Demo displayed test bypasses pattern priority only for 2.26 and preserves one minute slot', () => {
  const target = candidate(2.259);
  const other = {...candidate(2.23,'other'),_preferredPatternDistance:0};
  expect(chooseDemoCandidate([other,target],true,[223,226],true)?.signal_id).toBe('target');
  expect(chooseDemoCandidate([candidate(2.266)],true,undefined,true)).toBeNull();
  expect(chooseDemoCandidate([target],true)).toBeNull();
  expect(chooseDemoCandidate([candidate(2.26,'b'),candidate(2.26,'a')],true,undefined,true)?.signal_id).toBe('a');
});