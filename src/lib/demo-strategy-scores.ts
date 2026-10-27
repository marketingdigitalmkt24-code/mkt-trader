import { displayedDemoScore } from './demo-score-history';

export type StrategyScoreSummary = {
 strategy: string; score: string; demoWins: number; losses: number;
 firstWinAt: string; lastWinAt: string; historyFirstWinAt: string;
};

export function topWinningStrategyScores<T extends { strategy: string; score: string; demoWins: number }>(rows: T[]): T[] {
 return orderStrategyScores(rows, 'desc').slice(0, 10);
}

export type StrategyScoreOutcome = {
 signal_id: string; entry_strategy: string; entry_minute: string;
 score: number | null; result: string; source: 'demo' | 'rejected';
};

export function winningStrategyScores(rows: StrategyScoreOutcome[], period = 'all', now = Date.now()) {
 const groups = new Map<string, { strategy: string; score: string; demoWins: number; losses: number }>();
 const seen = new Set<string>();
 for (const row of rows) {
  if (row.source !== 'demo') continue;
  const score = displayedDemoScore(row.score);
  const result = row.result.toLowerCase();
  if (score === 'unscored' || !['win', 'loss'].includes(result)) continue;
  const identity = `${row.signal_id}:${result}`;
  if (seen.has(identity)) continue;
  seen.add(identity);
  const key = `${row.entry_strategy}:${score}`;
  const group = groups.get(key) ?? { strategy: row.entry_strategy, score, demoWins: 0, losses: 0 };
  if (result === 'loss') group.losses++;
  else if (filterStrategyScorePeriod([row], period, now).length) group.demoWins++;
  groups.set(key, group);
 }
 return [...groups.values()].filter(g => g.losses === 0 && g.demoWins > 0)
  .sort((a, b) => b.demoWins - a.demoWins || a.strategy.localeCompare(b.strategy) || Number(a.score) - Number(b.score));
}

export function orderStrategyScores<T extends { strategy: string; score: string; demoWins: number }>(rows: T[], order: string): T[] {
 return [...rows].sort((a, b) => {
  const byWins = order === 'asc' ? a.demoWins - b.demoWins : b.demoWins - a.demoWins;
  return byWins || Number(b.score) - Number(a.score) || a.strategy.localeCompare(b.strategy);
 });
}

export function filterStrategyScorePeriod(rows: StrategyScoreOutcome[], period: string, now = Date.now()) {
 const brtDay = (at: number) => new Date(at - 3 * 3600000).toISOString().slice(0, 10);
 return rows.filter(row => period === 'today' ? brtDay(Date.parse(row.entry_minute)) === brtDay(now)
  : period === '7d' ? Date.parse(row.entry_minute) >= now - 7 * 86400000 : true);
}

export async function readAllScorePages<T>(read: (from: number, to: number) => Promise<T[]>): Promise<T[]> {
 const rows: T[] = [];
 for (let from = 0; ; from += 1000) {
  const page = await read(from, from + 999);
  rows.push(...page);
  if (page.length < 1000) return rows;
 }
}
