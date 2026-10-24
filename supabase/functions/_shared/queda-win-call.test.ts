import { test, expect } from 'bun:test';
import { quedaWinCall, QUEDA_WIN_CALL } from './queda-win-call';

const curMin = 1792862400; // aligned minute
const prevIso = new Date((curMin - 60) * 1000).toISOString();
const win = { entry_strategy: 'CONTINUACAO_QUEDA_V1', entry_minute: prevIso, result: 'win', asset: 'APPLE-OTC', direction: 'PUT' };

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
