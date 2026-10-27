import { test, expect } from 'bun:test';
import { winningStrategyScores, filterStrategyScorePeriod, readAllScorePages, orderStrategyScores, topWinningStrategyScores, aggregateScoresByNote, type StrategyScoreOutcome } from './src/lib/demo-strategy-scores';
const row = (signal_id: string, entry_strategy = 'VELA_FORCA', score: number | null = 2.26, result = 'win', source: StrategyScoreOutcome['source'] = 'demo'): StrategyScoreOutcome => ({ signal_id, entry_strategy, score, result, source, entry_minute: '2026-10-27T03:00:00Z' });
test('chart keeps exactly ten highest total WIN cohorts, not the highest numerical scores', () => {
 const groups = Array.from({ length: 12 }, (_, i) => ({ strategy: 'VELA_FORCA', score: String(12 - i), demoWins: i, firstWinAt: '2026-10-24T03:00:00Z' }));
 const top = topWinningStrategyScores(groups);
 expect(top).toHaveLength(10);
 expect(top.map(g => g.demoWins)).toEqual([11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
 expect(top[0].firstWinAt).toBe('2026-10-24T03:00:00Z');
 expect(groups[0].score).toBe('12');
});
test('order filter sorts by total WIN of each note, descending first, and can be switched to ascending', () => {
 const groups = [
  { strategy: 'TENDENCIA', score: '4.50', demoWins: 2 }, { strategy: 'VELA_FORCA', score: '2.26', demoWins: 5 }, { strategy: 'TAKASHI', score: '9.10', demoWins: 1 },
 ];
 expect(orderStrategyScores(groups, 'desc').map(g => g.score)).toEqual(['2.26', '4.50', '9.10']);
 expect(orderStrategyScores(groups, 'asc').map(g => g.score)).toEqual(['9.10', '4.50', '2.26']);
});
test('a score requires at least one WIN and zero LOSS for that strategy', () => {
 expect(winningStrategyScores([row('a'), row('b', 'VELA_FORCA', 2.26, 'loss'), row('c', 'TENDENCIA'), row('d', 'TAKASHI', 4.5, 'pending')])).toEqual([{ strategy: 'TENDENCIA', score: '2.26', demoWins: 1, losses: 0 }]);
});
test('rejected TEST outcomes are ignored entirely, wins and losses alike', () => {
 const groups = winningStrategyScores([row('a'), row('b', 'VELA_FORCA', 2.264, 'loss', 'rejected'), row('c', 'TENDENCIA', 2.23), row('d', 'TENDENCIA', 2.23, 'win', 'rejected'), row('e', 'TENDENCIA', 2.23, 'win', 'rejected')]);
 expect(groups).toEqual([{ strategy: 'TENDENCIA', score: '2.23', demoWins: 1, losses: 0 }, { strategy: 'VELA_FORCA', score: '2.26', demoWins: 1, losses: 0 }]);
});
test('unknown notes and ties never become winning score cohorts', () => {
 expect(winningStrategyScores([row('a', 'VELA_FORCA', null), row('b', 'TENDENCIA', 2.26, 'tie')])).toEqual([]);
});
test('a new LOSS removes a previously winning score without deleting its observations', () => {
 const observations = [row('win')];
 expect(winningStrategyScores(observations).length).toBe(1);
 observations.push(row('loss', 'VELA_FORCA', 2.26, 'loss'));
 expect(winningStrategyScores(observations)).toEqual([]);
 expect(observations.length).toBe(2);
});
test('older LOSS keeps a score excluded when selecting today', () => {
 expect(winningStrategyScores([row('today'), { ...row('old', 'VELA_FORCA', 2.26, 'loss'), entry_minute: '2026-10-25T03:00:00Z' }], 'today', Date.parse('2026-10-27T05:05:00Z'))).toEqual([]);
});
test('today starts at Brasília midnight', () => {
 expect(filterStrategyScorePeriod([row('a'), { ...row('b'), entry_minute: '2026-10-27T02:59:59Z' }], 'today', Date.parse('2026-10-27T04:59:00Z')).map(r => r.signal_id)).toEqual(['a']);
});
test('yesterday follows the previous Brasília day, not midnight-UTC math', () => {
 const now = Date.parse('2026-10-27T05:05:00Z');
 const yesterdayEvening = { ...row('y'), entry_minute: '2026-10-27T02:00:00Z' };
 const todayAfterMidnight = row('a');
 expect(filterStrategyScorePeriod([todayAfterMidnight, yesterdayEvening], 'yesterday', now).map(r => r.signal_id)).toEqual(['y']);
});
test('15-day window includes the edge and excludes older entries', () => {
 const now = Date.parse('2026-10-27T05:05:00Z');
 const recent = { ...row('recent'), entry_minute: '2026-10-16T12:00:00Z' };
 const old = { ...row('old'), entry_minute: '2026-10-06T12:00:00Z' };
 expect(filterStrategyScorePeriod([old, recent, row('a')], '15d', now).map(r => r.signal_id)).toEqual(['recent', 'a']);
});
test('custom range filters by inclusive Brasília dates', () => {
 const now = Date.parse('2026-10-27T05:05:00Z');
 const yesterdayEvening = { ...row('y'), entry_minute: '2026-10-27T02:00:00Z' };
 expect(filterStrategyScorePeriod([row('a'), yesterdayEvening], 'custom', now, { from: '2026-10-26', to: '2026-10-26' }).map(r => r.signal_id)).toEqual(['y']);
 expect(filterStrategyScorePeriod([row('a')], 'custom', now, { from: '2026-10-26', to: '2026-10-26' })).toEqual([]);
});
test('pagination includes losses beyond the first thousand rows', async () => {
 const rows = await readAllScorePages(async from => from === 0 ? Array.from({ length: 1000 }, (_, i) => row(String(i))) : [row('last', 'VELA_FORCA', 2.26, 'loss')]);
 expect(rows.length).toBe(1001);
 expect(winningStrategyScores(rows)).toEqual([]);
});
test('Só por nota sums WINs across strategies and keeps earliest and latest WIN dates', () => {
 const rows = [
  { strategy: 'VELA_FORCA', score: '2.26', demoWins: 5, losses: 0, firstWinAt: '2026-10-25T03:00:00Z', lastWinAt: '2026-10-26T03:00:00Z', historyFirstWinAt: '2026-10-24T03:00:00Z' },
  { strategy: 'TENDENCIA', score: '2.26', demoWins: 3, losses: 0, firstWinAt: '2026-10-24T03:00:00Z', lastWinAt: '2026-10-27T03:00:00Z', historyFirstWinAt: '2026-10-23T03:00:00Z' },
  { strategy: 'TAKASHI', score: '4.50', demoWins: 2, losses: 0, firstWinAt: '2026-10-26T03:00:00Z', lastWinAt: '2026-10-26T04:00:00Z', historyFirstWinAt: '2026-10-26T03:00:00Z' },
 ];
 const notes = aggregateScoresByNote(rows);
 expect(notes).toHaveLength(2);
 const n226 = notes.find(n => n.score === '2.26');
 expect(n226.demoWins).toBe(8);
 expect(n226.strategies).toEqual(['VELA_FORCA', 'TENDENCIA']);
 expect(n226.firstWinAt).toBe('2026-10-24T03:00:00Z');
 expect(n226.lastWinAt).toBe('2026-10-27T03:00:00Z');
 expect(n226.historyFirstWinAt).toBe('2026-10-23T03:00:00Z');
});
