import { test, expect } from 'bun:test';
import { displayedDemoScore, filterScoreHistory, readDemoScoreHistory, scoreHistory, type DemoScoreOrder } from './src/lib/demo-score-history';
const order = (id: string, score: number | null, result = 'win', profit = 1.64): DemoScoreOrder => ({
 id, signal_id: id, score, result, profit, status: 'confirmed', iq_option_id: '14383504823',
 entry_minute: '2026-10-24T03:00:00Z', settled_at: null,
});
test('groups by the actual displayed two-decimal score, not a score band', () => {
 const history = scoreHistory([order('a', 2.261), order('b', 2.264, 'loss', -2), order('c', 2.23)]);
 expect(history.byScore.find(r => r.score === '2.26')).toMatchObject({wins: 1, losses: 1, accuracy: 50, profit: -.36});
 expect(history.byScore.length).toBe(2);
 expect(displayedDemoScore(null)).toBe('unscored');
});
test('only confirmed numeric broker orders count; pending and ties do not dilute accuracy', () => {
 const history = scoreHistory([order('a', 2.26), order('b', 2.26, 'pending', 999), order('c', null, 'tie', 0),
  {...order('d', 2.26), status: 'failed'}, {...order('e', 2.26), iq_option_id: 'invalid'}]);
 expect(history.totals).toEqual({wins: 1, losses: 0, pending: 1, ties: 1, accuracy: 100, profit: 1.64});
 expect(history.timeline.length).toBe(2);
 expect(history.byScore.find(r => r.score === 'unscored')?.ties).toBe(1);
});
test('balance evolves by settlement time and includes losses in cumulative accuracy', () => {
 const history = scoreHistory([{...order('a', 2.26), settled_at: '2026-10-24T03:02:00Z'},
  {...order('b', 2.23, 'loss', -2), settled_at: '2026-10-24T03:01:00Z'}]);
 expect(history.timeline.map(r => r.profit)).toEqual([-2, -.36]);
 expect(history.timeline.map(r => r.accuracy)).toEqual([0, 50]);
});
test('today uses Brasília midnight and exact-score selection', () => {
 const rows = [order('a', 2.26), {...order('b', 2.26), entry_minute: '2026-10-24T02:59:59Z'}, order('c', 2.23)];
 expect(filterScoreHistory(rows, 'today', '2.26', Date.parse('2026-10-24T23:00:00Z')).map(r => r.id)).toEqual(['a']);
});
test('reads every order page and joins scores by exact signal, leaving missing scores unknown', async () => {
 const rows = await readDemoScoreHistory(async (from,to) => {
  expect(to-from).toBe(999);
  return from === 0 ? Array.from({length:1000}, (_,i) => order(String(i), null)) : [order('last', null)];
 }, async ids => ids.filter(id => id !== 'last').map(signal_id => ({signal_id, score:2.26})));
 expect(rows.length).toBe(1001);
 expect(rows[0].score).toBe(2.26);
 expect(rows[1000].score).toBeNull();
});