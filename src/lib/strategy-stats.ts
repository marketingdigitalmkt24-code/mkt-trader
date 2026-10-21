export interface StrategyRow {
  entry_strategy: string | null;
  result: string;
  timeframe: string | null;
  test_sequence_strategy: string | null;
  test_inverted_strategy?: string | null;
}
export interface StrategyStat { strategy: string; wins: number; losses: number }

// Estratégias que atualmente entram na IQ Option (real) e/ou são acompanhadas ativamente.
// Tudo fora dessa lista vira uma única linha resumida de testes/histórico no card.
export const ACTIVE_STRATEGIES = ['ICHIMOKU_FORCA', 'KDJ_RSI', 'TREND_WIN_LOSS_FORCE_LOSS'] as const;
export const TESTS_GROUPED_KEY = 'TESTES_HISTORICO';

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
    if (row.entry_strategy === 'FORCE_LOSS_WIN' || row.entry_strategy === 'FORCA_INVERTIDA') continue;
    // Retomada real (RETOMADA) e observação TESTE (TREND_WIN_LOSS_FORCE_LOSS) são a mesma estratégia.
    if (row.entry_strategy) add(row.entry_strategy === 'RETOMADA' ? 'TREND_WIN_LOSS_FORCE_LOSS' : row.entry_strategy, row.result);
    if (row.timeframe === 'TEST' && row.test_sequence_strategy === 'TREND_WIN_LOSS_FORCE_LOSS') {
      add(row.test_sequence_strategy, row.result);
    }
    // Força Invertida removida (20/10/2026): sem projeção na assertividade.
  }
  return [...byStrategy.values()].sort((a, b) => {
    const aSettled = a.wins + a.losses;
    const bSettled = b.wins + b.losses;
    const rateDifference = (bSettled ? b.wins / bSettled : 0) - (aSettled ? a.wins / aSettled : 0);
    return rateDifference || bSettled - aSettled || a.strategy.localeCompare(b.strategy);
  });
}

// Card "Assertividade por estratégia": só as estratégias ativas em linhas próprias;
// todo o resto (testes antigos e histórico de estratégias desativadas) resumido em uma linha.
export function strategyAccuracyDisplay(stats: StrategyStat[]): StrategyStat[] {
  const active = stats.filter(s => (ACTIVE_STRATEGIES as readonly string[]).includes(s.strategy));
  const grouped = stats.reduce<StrategyStat>(
    (acc, s) => {
      if (!(ACTIVE_STRATEGIES as readonly string[]).includes(s.strategy)) {
        acc.wins += s.wins;
        acc.losses += s.losses;
      }
      return acc;
    },
    { strategy: TESTS_GROUPED_KEY, wins: 0, losses: 0 },
  );
  return grouped.wins + grouped.losses > 0 ? [...active, grouped] : active;
}