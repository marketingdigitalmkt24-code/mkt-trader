import {test,expect} from 'bun:test';
import {demoWinningPatternMatch,chooseDemoCandidate,demoPatternWinsAllowed} from './demo-continuation';
import {demoRejectionReason} from './demo-rejection';
import {isSuperSelected} from './demo-validated';
test('Demo requires fewer than 200 confirmed pattern WIN and retains the best eligible pattern',()=>{
  expect(demoPatternWinsAllowed(199)).toBe(true);
  expect(demoPatternWinsAllowed(200)).toBe(false);
  expect(demoPatternWinsAllowed(201)).toBe(false);
  expect(demoPatternWinsAllowed(0)).toBe(false);
  expect(demoPatternWinsAllowed(undefined)).toBe(false);
  const base={asset:'X',direction:'PUT',entry_strategy:'TENDENCIA',created_at:'2026-10-24T23:50:00Z',_score:2.26,_preferredPatternDistance:0.1};
  const eligible={...base,signal_id:'199-wins',_patternWins:199};
  const blocked={...base,signal_id:'200-wins',_patternWins:200};
  expect(chooseDemoCandidate([blocked,eligible,{...eligible,signal_id:'198-wins',_patternWins:198}],true)?.signal_id).toBe('199-wins');
  expect(chooseDemoCandidate([blocked],true)).toBeNull();
  expect(demoRejectionReason({score:2.26,patternDistance:0.1,patternWins:199})).toBeNull();
  expect(demoRejectionReason({score:2.26,patternDistance:0.1,patternWins:200})).toEqual({code:'pattern_win_limit',details:{wins:200,exclusive_maximum:200}});
});
test('WIN beyond fourteen notes is eligible without GEV while score and principal limits remain',()=>{
 const match=demoWinningPatternMatch([{f:[0,1],result:'win',score:3.15,signal_id:'win-ref'}],[0,1]);
 expect(match).toMatchObject({signal_id:'win-ref',score:3.15,distance:0});
 expect(demoRejectionReason({score:3.15,referenceMatch:false,patternDistance:match?.distance})).toBeNull();
 expect(demoRejectionReason({score:1.99,patternDistance:0})?.code).toBe('score_floor');
 expect(isSuperSelected(3.15)).toBe(false);
 expect(chooseDemoCandidate([{signal_id:'candidate',asset:'X',direction:'PUT',entry_strategy:'TENDENCIA',created_at:'2026-10-24T23:30:00Z',_score:3.15,_preferredPatternDistance:0}],true,[226])?.signal_id).toBe('candidate');
});
test('only recorded WIN shapes within 1.3 match; LOSS, missing identity and far charts cannot label entry',()=>{
 expect(demoWinningPatternMatch([{f:[0],result:'loss',signal_id:'loss'}],[0])).toBeNull();
 expect(demoWinningPatternMatch([{f:[0],result:'win'}],[0])).toBeNull();
 expect(demoWinningPatternMatch([{f:[0],result:'win',signal_id:'win'}],[1.31])).toBeNull();
 expect(demoWinningPatternMatch([{f:[0],result:'win',signal_id:'win'}],[1.3])?.distance).toBe(1.3);
});
test('chart priority chooses more similar WIN across scores instead of exact 2.26',()=>{
 const base={asset:'X',direction:'PUT',entry_strategy:'TENDENCIA',created_at:'2026-10-24T23:34:00Z',_preferredPatternDistance:0.1};
 const exact={...base,signal_id:'exact',_score:2.26,_patternWins:1,_patternAccuracy:1};
 const repeated={...base,signal_id:'repeated',_score:3.15,_patternWins:4,_patternAccuracy:0.8};
 expect(chooseDemoCandidate([exact,repeated],true,[226])?.signal_id).toBe('repeated');
 expect(isSuperSelected(repeated._score)).toBe(false);
});
test('similar chart evidence counts confirmed winners and losers once regardless of note',()=>{
 const samples=[{f:[0],result:'win',score:2.26,signal_id:'a',profit:1.6},
 {f:[0.5],result:'win',score:3.15,signal_id:'b',profit:1.7},
 {f:[0.5],result:'win',score:3.15,signal_id:'b',profit:1.7},
 {f:[1],result:'loss',score:2.04,signal_id:'c',profit:-2},
 {f:[1.31],result:'win',score:2.26,signal_id:'far',profit:1.6}];
 expect(demoWinningPatternMatch(samples,[0])).toMatchObject({wins:2,losses:1,accuracy:2/3});
 expect(demoWinningPatternMatch(samples,[0])?.profit).toBeCloseTo(1.3);
});