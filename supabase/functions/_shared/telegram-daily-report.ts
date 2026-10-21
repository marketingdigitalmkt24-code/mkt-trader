export interface ReportRow {
  signal_id: string; timeframe: string | null; iq_option_id: string | null;
  result: string; profit: number; created_at: string; entry_strategy: string | null;
  test_sequence_strategy: string | null;
  test_inverted_strategy?: string | null;
}
const labels: Record<string, string> = {
  TENDENCIA: 'Tendência', TREND_WIN_LOSS_FORCE_LOSS: 'Retomada (TESTE)',
  FORCA_INVERTIDA: 'Força Invertida (TESTE)',
  TENDENCIA_V1: 'Tendência V1', FOUR_WIN_REVERSAL: 'Após 4 ganhos',
  THREE_FORCE: 'Após 3 Velas de Força',
  REVERSAO_RSI: 'Reversão RSI', VELA_FORCA: 'Vela de força', ROMPIMENTO: 'Rompimento',
  RECUO_EMA21: 'Recuo na média 21', KDJ: 'KDJ', ICHIMOKU: 'Ichimoku', ICHIMOKU_FORCA: 'Ichimoku + Vela de Força', KDJ_RSI: 'KDJ + Reversão RSI', AI: 'IA',
};
export function reportClock(now = new Date()) {
  const local = new Date(now.getTime() - 3 * 3600000);
  const date = local.toISOString().slice(0, 10);
  return { date, due: local.getUTCHours() === 23 && local.getUTCMinutes() === 59,
    start: `${date}T03:00:00.000Z`, end: now.toISOString() };
}
export function dailyReportStats(rows: ReportRow[], now: Date) {
  const clock = reportClock(now);
  const principal = rows.filter(r => !r.signal_id.startsWith('copy-') && !r.signal_id.startsWith('mt5-')
    && !['TEST', 'MT5'].includes(r.timeframe ?? '') && Boolean(r.iq_option_id)
    && !r.iq_option_id?.toLowerCase().startsWith('test') && r.created_at >= clock.start && r.created_at <= clock.end);
  const wins = principal.filter(r => r.result === 'win').length;
  const losses = principal.filter(r => ['loss', 'loose'].includes(r.result)).length;
  const ties = principal.filter(r => ['tie', 'draw', 'equal'].includes(r.result)).length;
  const pending = principal.filter(r => ['pending', 'open'].includes(r.result)).length;
  const profit = principal.filter(r => ['win', 'loss', 'loose', 'tie', 'draw', 'equal'].includes(r.result))
    .reduce((sum, r) => sum + Number(r.profit || 0), 0);
  return { wins, losses, ties, pending, profit, winRate: wins + losses ? wins / (wins + losses) * 100 : 0 };
}
export function bestReportStrategies(rows: ReportRow[], now: Date) {
  const clock = reportClock(now);
  const stats = new Map<string, { strategy: string; wins: number; losses: number }>();
  const add = (strategy: string, result: string) => {
    const stat = stats.get(strategy) ?? { strategy, wins: 0, losses: 0 };
    if (result === 'win') stat.wins++;
    if (result === 'loss') stat.losses++;
    stats.set(strategy, stat);
  };
  for (const r of rows) {
    if (r.created_at < clock.start || r.created_at > clock.end) continue;
    if (r.entry_strategy === 'FORCE_LOSS_WIN' || r.entry_strategy === 'FORCA_INVERTIDA') continue;
    if (r.timeframe === 'MT5' || /^(copy-|mt5-)/.test(r.signal_id)) continue;
    if (r.entry_strategy) add(r.entry_strategy, r.result);
    if (r.timeframe === 'TEST' && r.test_sequence_strategy === 'TREND_WIN_LOSS_FORCE_LOSS') add(r.test_sequence_strategy, r.result);
  }
  return [...stats.values()].filter(s => s.wins + s.losses > 0).sort((a, b) =>
    b.wins / (b.wins + b.losses) - a.wins / (a.wins + a.losses)
    || b.wins + b.losses - a.wins - a.losses || a.strategy.localeCompare(b.strategy)).slice(0, 5);
}
export function formatDailyReport(rows: ReportRow[], now: Date, account: string) {
  const stats = dailyReportStats(rows, now);
  const top = bestReportStrategies(rows, now);
  return ['📊 AGÊNCIA MKT TRADER — Relatório diário',
    `📅 ${reportClock(now).date.split('-').reverse().join('/')} • 23:59 Brasília`,
    `🏦 Conta principal IQ Option • ${account === 'REAL' ? 'REAL' : 'DEMONSTRAÇÃO'}`,
    `✅ Ganhos: ${stats.wins} | ❌ Perdas: ${stats.losses} | ➖ Empates: ${stats.ties}`,
    `🎯 Win rate: ${stats.winRate.toFixed(1).replace('.', ',')}%`,
    `💰 Resultado líquido: ${stats.profit < 0 ? '-' : '+'}US$ ${Math.abs(stats.profit).toFixed(2).replace('.', ',')}`,
    `⏳ Ordens pendentes: ${stats.pending}`,
    '', '🏆 5 melhores estratégias — resultados do dia (Brasília)',
    'Ranking por acerto; inclui observações TESTE e ordens da principal, sem cópias.',
    ...top.map((s, i) => `${i + 1}. ${labels[s.strategy] ?? s.strategy}: ${(100 * s.wins / (s.wins + s.losses)).toFixed(1).replace('.', ',')}% • ${s.wins} ganhos / ${s.losses} perdas • ${s.wins + s.losses} operações`),
    ...(top.length ? [] : ['Ainda não há estratégias com resultados encerrados.']),
    '', '📌 Parcial às 23:59; pendentes não entram no lucro. Histórico não é garantia de ganhos.',
  ].join('\n');
}