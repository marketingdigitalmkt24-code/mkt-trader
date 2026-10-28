import { expect, test } from 'bun:test';
import { demoRecovery, type RecoveryOrder } from './demo-recovery';
const last = (level: number, amount: number, loss: number): RecoveryOrder => ({ status: 'confirmed', result: 'loss', account_type: 'PRACTICE', iq_option_id: '123', amount, profit: -amount, recovery_level: level, recovery_loss: loss, recovery_base: 1 });
test('recovers accumulated loss plus base gain using broker payout and rounding upward', () => {
  expect(demoRecovery(last(0, 1, 0), 1, .83)).toMatchObject({ amount: 2.21, recovery_level: 1, recovery_loss: 1 });
  expect(demoRecovery(last(1, 2.21, 1), 1, .82)).toMatchObject({ amount: 4.92, recovery_level: 2, recovery_loss: 3.21 });
  expect(demoRecovery(last(3, 10.35, 8.13), 1, .87)).toMatchObject({ amount: 22.25, recovery_level: 4 });
});
test('four lost gales restart base without fifth recovery', () => {
  expect(demoRecovery(last(4, 22.25, 18.48), 1, .82)).toMatchObject({ amount: 1, recovery_level: 0, recovery_loss: 0 });
});
test('WIN restarts base; no ambiguous pending order or missing payout opens recovery', () => {
  expect(demoRecovery({ ...last(2, 4.92, 3.21), result: 'win' }, 1, .82)?.amount).toBe(1);
  expect(demoRecovery({ ...last(0, 1, 0), status: 'unknown' }, 1, .82)).toBeNull();
  expect(demoRecovery({ ...last(0, 1, 0), result: 'pending' }, 1, .82)).toBeNull();
  expect(demoRecovery(last(0, 1, 0), 1, null)).toBeNull();
});