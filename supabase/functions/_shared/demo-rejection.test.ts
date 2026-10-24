import { describe, it, expect } from 'bun:test';
import { demoRejectionReason } from './demo-rejection';
describe('Demo rejection reasons preserve selection boundaries', () => {
 it('records learned rejection at -0.8', () => { expect(demoRejectionReason({score:3,learned:-0.8})?.code).toBe('learned_history'); expect(demoRejectionReason({score:3,learned:-0.79})).toBeNull(); });
 it('records actual unrounded score below 2.0', () => { expect(demoRejectionReason({score:1.999})?.details.score).toBe(1.999); expect(demoRejectionReason({score:2})).toBeNull(); });
 it('blocks exact 2.26 without chart correspondence', () => { expect(demoRejectionReason({score:2.26,patternDistance:1.301})?.code).toBe('eight_pattern_mismatch'); expect(demoRejectionReason({score:2.26,patternDistance:1.3})).toBeNull(); });
 it('records unavailable reference distance honestly', () => { expect(demoRejectionReason({score:2.26,patternDistance:Infinity})?.details.distance).toBeNull(); });
 it('records general reference rejection', () => { expect(demoRejectionReason({score:3,referenceMatch:false})?.code).toBe('reference_mismatch'); });
 it('records unavailable priorities', () => { expect(demoRejectionReason({score:3,priorityAvailable:false})?.code).toBe('priority_unavailable'); });
 it('distinguishes eligible losing slot from rule rejection', () => { expect(demoRejectionReason({score:3,winner:'other',signalId:'candidate'})?.code).toBe('minute_priority'); expect(demoRejectionReason({score:3,winner:'candidate',signalId:'candidate'})).toBeNull(); });
});