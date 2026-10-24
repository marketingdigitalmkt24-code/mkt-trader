import { test, expect } from 'bun:test';
import { demoHistoryOutcome } from '../_shared/demo-history';
test('matches exact broker option ID even when portfolio ID differs', () => {
 const outcome = demoHistoryOutcome({ id: 'portfolio-1', option_id: 14383504823, status: 'closed', pnl_net: '0.86', result: 'win' });
 expect(outcome?.ids).toContain('14383504823');
 expect(outcome?.result).toBe('win');
 expect(outcome?.profit).toBe(0.86);
 expect(outcome?.ids).not.toContain('14383507171');
});
test('reads actual USD1 loss from returned payout without assuming a tie', () => {
 const outcome = demoHistoryOutcome({ option_id: 14383507171, close_at: 1792782060, pnl: 0, win_amount: 0, amount: 1, raw_event: { binary_options_option_changed1: { result: 'loose' } } });
 expect(outcome?.profit).toBe(-1);
 expect(outcome?.result).toBe('loss');
});
test('does not settle open or missing-profit history', () => {
 expect(demoHistoryOutcome({ option_id: 14383509054, status: 'open', pnl: 0 })).toBeNull();
 expect(demoHistoryOutcome({ option_id: 14383509054, status: 'closed' })).toBeNull();
});
test('reads legacy terminal result and nested exact IDs', () => {
 const outcome = demoHistoryOutcome({ external_id: 14383511353, result: 'equal', win_amount: 1, amount: 1 });
 expect(outcome).toEqual({ ids: ['14383511353'], result: 'tie', profit: 0 });
});