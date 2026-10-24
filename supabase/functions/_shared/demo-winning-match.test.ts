import {test,expect} from 'bun:test';
import {demoWinningPatternMatch,chooseDemoCandidate} from './demo-continuation';
import {demoRejectionReason} from './demo-rejection';
import {isSuperSelected} from './demo-validated';
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