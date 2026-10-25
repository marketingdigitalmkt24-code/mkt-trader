import { describe, it, expect } from 'bun:test';
import { demoRejectionReason } from './demo-rejection';
describe('Demo rejection reasons preserve selection boundaries', () => {
 it('records learned rejection at -0.8', () => { expect(demoRejectionReason({score:3,learned:-0.8})?.code).toBe('learned_history'); expect(demoRejectionReason({score:3,learned:-0.79})).toBeNull(); });
 it('records actual unrounded score below 2.0', () => { expect(demoRejectionReason({score:1.999})?.details.score).toBe(1.999); expect(demoRejectionReason({score:2})).toBeNull(); });
 it('releases exact 2.26 without chart correspondence', () => { expect(demoRejectionReason({score:2.26,patternDistance:Infinity,learned:-1})).toBeNull(); });
 it('records unavailable reference distance honestly for unselected notes', () => { expect(demoRejectionReason({score:2.25,patternDistance:Infinity})?.details.distance).toBeNull(); });
 it('GEV mismatch no longer blocks a valid WIN pattern', () => { expect(demoRejectionReason({score:3,referenceMatch:false,patternDistance:1.2})).toBeNull(); });
 it('records unavailable priorities', () => { expect(demoRejectionReason({score:3,priorityAvailable:false})?.code).toBe('priority_unavailable'); });
 it('distinguishes eligible losing slot from rule rejection', () => { expect(demoRejectionReason({score:3,winner:'other',signalId:'candidate'})?.code).toBe('minute_priority'); expect(demoRejectionReason({score:3,winner:'candidate',signalId:'candidate'})).toBeNull(); });
});
for(const score of [2.26,2.23,2.18,2.64,2.88,2.03,2.69,2.91,2.04,2.61,2.78,2.37,2.76,2.20])it(`releases exact note ${score} but preserves unavailable priorities`,()=>{
 expect(demoRejectionReason({score,learned:-1,patternDistance:Infinity})).toBeNull();
 expect(demoRejectionReason({score,patternDistance:Infinity,priorityAvailable:false})?.code).toBe('priority_unavailable');
});