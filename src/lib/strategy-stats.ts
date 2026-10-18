export interface StrategyRow {
  entry_strategy: string | null;
  result: string;
  timeframe: string | null;
  test_sequence_strategy: string | null;
  test_inverted_strategy?: string | null;
}
export interface StrategyStat { strategy: string; wins: number; losses: number }

export async function allStrategyRows(readPage: (from: number, to: number) => Promise<StrategyRow[]>): Promise<StrategyRow[]> {
  const rows: StrategyRow[] = [];
  for (let from = 0; ; from += 1000) {
    const page = await readPage(from, from + 999);
    rows.push(...page);
    if (page.length < 1000) return rows;
  }
}

export function strategyStats(rows: StrategyRow[]): StrategyStat[] {
  const byStrategy = new Map<string, StrategyStat>();
  const add = (strategy: string, result: string) => {
    const stat = byStrategy.get(strategy) ?? { strategy, wins: 0, losses: 0 };
    if (result === 'win') stat.wins++;
    if (result === 'loss') stat.losses++;
    byStrategy.set(strategy, stat);
  };
  for (const row of rows) {
    if (row.entry_strategy) add(row.entry_strategy, row.result);
    if (row.timeframe === 'TEST' && row.test_sequence_strategy === 'TREND_WIN_LOSS_FORCE_LOSS') {
      add(row.test_sequence_strategy, row.result);
    }
    if (row.timeframe === 'TEST' && row.entry_strategy === 'VELA_FORCA' && row.test_inverted_strategy === 'FORCA_INVERTIDA') {
      add(row.test_inverted_strategy, row.result === 'win' ? 'loss' : row.result === 'loss' ? 'win' : row.result);
    }
  }
  return [...byStrategy.values()].sort((a, b) => {
    const aSettled = a.wins + a.losses;
    const bSettled = b.wins + b.losses;
    const rateDifference = (bSettled ? b.wins / bSettled : 0) - (aSettled ? a.wins / aSettled : 0);
    return rateDifference || bSettled - aSettled || a.strategy.localeCompare(b.strategy);
  });
}