import { test, expect } from 'bun:test';
import { quedaWinCall, quedaWinRetry, QUEDA_WIN_CALL, QUEDA_WIN_RETRY } from './queda-win-call';

const curMin = 1792862400; // aligned minute
const prevIso = new Date((curMin - 60) * 1000).toISOString();
const win = { entry_strategy: 'CONTINUACAO_QUEDA_V1', entry_minute: prevIso, result: 'win', asset: 'APPLE-OTC', direction: 'PUT', status: 'confirmed', iq_option_id: '14383504823' };

test('Queda PUT win at the previous minute authorizes a CALL on the same asset', () => {
  expect(quedaWinCall([win], curMin)).toEqual({ asset: 'APPLE-OTC', direction: 'CALL' });
});

test('losses, ties, other strategies and other directions never trigger', () => {
  expect(quedaWinCall([{ ...win, result: 'loss' }], curMin)).toBeNull();
  expect(quedaWinCall([{ ...win, result: 'tie' }], curMin)).toBeNull();
  expect(quedaWinCall([{ ...win, entry_strategy: 'TETO_V1' }], curMin)).toBeNull();
  expect(quedaWinCall([{ ...win, direction: 'CALL' }], curMin)).toBeNull();
  expect(quedaWinCall([{ ...win, asset: '' }], curMin)).toBeNull();
});

test('only the immediately previous minute triggers; older or future wins do not', () => {
  expect(quedaWinCall([{ ...win, entry_minute: new Date((curMin - 120) * 1000).toISOString() }], curMin)).toBeNull();
  expect(quedaWinCall([win], curMin + 60)).toBeNull();
  expect(quedaWinCall([], curMin)).toBeNull();
});

test('rejects unaligned minutes', () => {
  expect(quedaWinCall([win], curMin + 7)).toBeNull();
  expect(QUEDA_WIN_CALL).toBe('QUEDA_WIN_CALL_V1');
});
const loss = { ...win, entry_strategy: QUEDA_WIN_CALL, direction: 'CALL', result: 'loss' };
test('Queda win confirmed loss authorizes one CALL on the same asset next minute', () => {
  expect(quedaWinRetry([loss], curMin)).toEqual({ asset: 'APPLE-OTC', direction: 'CALL' });
});
test('retry only follows a loss of Queda win, never wins, ties, PUT or Queda losses', () => {
  for (const row of [{ ...loss, result: 'win' }, { ...loss, result: 'tie' }, { ...loss, result: 'pending' },
    { ...loss, direction: 'PUT' }, { ...loss, entry_strategy: 'CONTINUACAO_QUEDA_V1' }]) {
    expect(quedaWinRetry([row], curMin)).toBeNull();
  }
});
test('a retry loss never starts another retry', () => {
  expect(quedaWinRetry([{ ...loss, entry_strategy: QUEDA_WIN_RETRY }], curMin)).toBeNull();
});
test('retry cannot move forward to a later minute or an unaligned minute', () => {
  expect(quedaWinRetry([loss], curMin + 60)).toBeNull();
  expect(quedaWinRetry([loss], curMin - 60)).toBeNull();
  expect(quedaWinRetry([loss], curMin + 1)).toBeNull();
});
test('both triggers require exact broker confirmation', () => {
  for (const invalid of [{ status: 'unknown' }, { iq_option_id: '' }, { iq_option_id: 'test-1' }]) {
    expect(quedaWinCall([{ ...win, ...invalid }], curMin)).toBeNull();
    expect(quedaWinRetry([{ ...loss, ...invalid }], curMin)).toBeNull();
  }
});
