import { describe, expect, test } from 'bun:test';
import { demoGaleAmount, demoPayout, nextDemoGaleState } from './demo-gale.ts';

describe('Demo gale recovery', () => {
  test('LOSS on base entry starts gale 1 recovering that loss', () => {
    expect(nextDemoGaleState({ result: 'loss', amount: 1, recovery_level: 0, recovery_loss: 0 })).toEqual({ level: 1, loss: 1 });
  });
  test('gale amount recovers losses plus base gain by the return', () => {
    expect(demoGaleAmount(1, { level: 1, loss: 1 }, 0.82)).toBe(2.22);
  });
  test('fourth gale LOSS goes back to the base amount', () => {
    const state = nextDemoGaleState({ result: 'loss', amount: 24.28, recovery_level: 4, recovery_loss: 19.09 });
    expect(state).toEqual({ level: 0, loss: 0 });
    expect(demoGaleAmount(1, state!, 0.82)).toBe(1);
  });
  test('third gale LOSS advances to the fourth gale', () => {
    expect(nextDemoGaleState({ result: 'loss', amount: 10.94, recovery_level: 3, recovery_loss: 8.15 })).toEqual({ level: 4, loss: 19.09 });
  });
  test('WIN resets to base', () => {
    expect(nextDemoGaleState({ result: 'win', amount: 4.93, recovery_level: 2, recovery_loss: 3.22 })).toEqual({ level: 0, loss: 0 });
  });
  test('unknown previous result waits instead of guessing', () => {
    expect(nextDemoGaleState({ result: 'pending', amount: 1 })).toBeNull();
  });
  test('gale is not sized without a known return', () => {
    expect(demoGaleAmount(1, { level: 1, loss: 1 }, null)).toBeNull();
  });
  test('return comes from broker commission', () => {
    expect(demoPayout({ option: { profit: { commission: 18 } } })).toBeCloseTo(0.82);
  });
});
