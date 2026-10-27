import { test, expect } from 'bun:test';
import { winningStrategyScores, filterStrategyScorePeriod, readAllScorePages, orderStrategyScores, topWinningStrategyScores, type StrategyScoreOutcome } from './src/lib/demo-strategy-scores';
const row = (signal_id: string, entry_strategy = 'VELA_FORCA', score: number | null = 2.26, result = 'win', source: StrategyScoreOutcome['source'] = 'demo'): StrategyScoreOutcome => ({ signal_id, entry_strategy, score, result, source, entry_minute: '2026-10-27T03:00:00Z' });
test('chart keeps exactly ten highest total WIN cohorts, not the highest numerical scores', () => {
 const groups = Array.from({ length: 12 }, (_, i) => ({ strategy: 'VELA_FORCA', score: String(12 - i), demoWins: i, rejectedWins: i * 2, firstWinAt: '2026-10-24T03:00:00Z' }));
 const top = topWinningStrategyScores(groups);
 expect(top).toHaveLength(10);
 expect(top.map(g => g.demoWins + g.rejectedWins)).toEqual([33, 30, 27, 24, 21, 18, 15, 12, 9, 6]);
 expect(top[0].firstWinAt).toBe('2026-10-24T03:00:00Z');
 expect(groups[0].score).toBe('12');
});
test('order filter sorts by total WIN of each note, descending first, and can be switched to ascending', () => {
 const groups = [
  { strategy: 'TENDENCIA', score: '4.50', demoWins: 2, rejectedWins: 2 }, { strategy: 'VELA_FORCA', score: '2.26', demoWins: 5, rejectedWins: 0 }, { strategy: 'TAKASHI', score: '9.10', demoWins: 1, rejectedWins: 2 },
 ];
 expect(orderStrategyScores(groups, 'desc').map(g => g.score)).toEqual(['2.26', '4.50', '9.10']);
 expect(orderStrategyScores(groups, 'asc').map(g => g.score)).toEqual(['9.10', '4.50', '2.26']);
});
test('a score requires at least one WIN and zero LOSS for that strategy', () => {
 expect(winningStrategyScores([row('a'), row('b', 'VELA_FORCA', 2.26, 'loss'), row('c', 'TENDENCIA'), row('d', 'TAKASHI', 4.5, 'pending')])).toEqual([{ strategy: 'TENDENCIA', score: '2.26', demoWins: 1, rejectedWins: 0, losses: 0 }]);
});
test('rejected TEST losses veto a cohort and rejected WIN counts remain separate', () => {
 const groups = winningStrategyScores([row('a'), row('b', 'VELA_FORCA', 2.264, 'loss', 'rejected'), row('c', 'TENDENCIA', 2.23), row('d', 'TENDENCIA', 2.23, 'win', 'rejected'), row('d', 'TENDENCIA', 2.23, 'win', 'rejected')]);
 expect(groups).toEqual([{ strategy: 'TENDENCIA', score: '2.23', demoWins: 1, rejectedWins: 1, losses: 0 }]);
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
test('pagination includes losses beyond the first thousand rows', async () => {
 const rows = await readAllScorePages(async from => from === 0 ? Array.from({ length: 1000 }, (_, i) => row(String(i))) : [row('last', 'VELA_FORCA', 2.26, 'loss')]);
 expect(rows.length).toBe(1001);
 expect(winningStrategyScores(rows)).toEqual([]);
});