import { test, expect } from 'bun:test';
import { winningStrategyScores, filterStrategyScorePeriod, readAllScorePages, type StrategyScoreOutcome } from './src/lib/demo-strategy-scores';
const row = (signal_id: string, entry_strategy = 'VELA_FORCA', score: number | null = 2.26, result = 'win', source: StrategyScoreOutcome['source'] = 'demo'): StrategyScoreOutcome => ({ signal_id, entry_strategy, score, result, source, entry_minute: '2026-10-27T03:00:00Z' });
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