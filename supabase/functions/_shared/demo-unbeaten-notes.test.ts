import { expect, test } from 'bun:test';
import { readUnbeatenDemoNotes, unbeatenDemoNotes } from './demo-unbeaten-notes';
const now = Date.parse('2026-10-28T03:06:00Z');
const row = (signal_id: string, result = 'win') => ({
  signal_id, result, status: 'confirmed', account_type: 'PRACTICE', iq_option_id: signal_id.replace(/\D/g, '') || '1',
  profit: result === 'win' ? .82 : -1, settled_at: '2026-10-28T03:05:01Z',
});
test('all displayed notes qualify and most confirmed WIN comes first, not largest note', () => {
  const rows = [row('1'), row('2'), row('3')];
  expect(unbeatenDemoNotes(rows, new Map([['1', .144], ['2', .141], ['3', 4.9]]), now))
    .toEqual([{ cents: 14, wins: 2 }, { cents: 490, wins: 1 }]);
});
test('a LOSS permanently vetoes that displayed note despite subsequent WIN', () => {
  expect(unbeatenDemoNotes([row('1'), row('2', 'loss'), row('3')],
    new Map([['1', .14], ['2', .144], ['3', .141]]), now)).toEqual([]);
});
test('pending, failed, REAL, nonbroker and future results never teach note support', () => {
  const rows = [row('1', 'pending'), { ...row('2'), status: 'failed' },
    { ...row('3'), account_type: 'REAL' }, { ...row('4'), iq_option_id: 'test4' },
    { ...row('5'), settled_at: '2026-10-28T03:07:00Z' }, { ...row('6'), settled_at: null }];
  expect(unbeatenDemoNotes(rows, new Map(rows.map(r => [r.signal_id, .14])), now)).toEqual([]);
});
test('duplicate broker outcome does not inflate WIN count', () => {
  expect(unbeatenDemoNotes([row('1'), row('1')], new Map([['1', .14]]), now)).toEqual([{ cents: 14, wins: 1 }]);
});
test('reads every history page so older LOSS vetoes current winning note', async () => {
  const notes = await readUnbeatenDemoNotes(async (from, to) => {
    expect(to - from).toBe(999);
    return from === 0 ? Array.from({ length: 1000 }, (_, i) => row(String(i + 1))) : [row('1001', 'loss')];
  }, async ids => ids.map(signal_id => ({ signal_id, score: .14 })), now);
  expect(notes).toEqual([]);
});
test('fresh confirmed WIN updates the support count on the next read', () => {
  const scores = new Map([['1', .14], ['2', .14]]);
  expect(unbeatenDemoNotes([row('1')], scores, now)[0]?.wins).toBe(1);
  expect(unbeatenDemoNotes([row('1'), row('2')], scores, now)[0]?.wins).toBe(2);
});
test('note identity matches two-decimal history display rather than raw score', () => {
  expect(unbeatenDemoNotes([row('1')], new Map([['1', 2.675]]), now)).toEqual([{ cents: 267, wins: 1 }]);
});