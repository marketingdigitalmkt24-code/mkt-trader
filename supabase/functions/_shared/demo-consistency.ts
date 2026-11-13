export const DEMO_CONSISTENCY_VERSION = 'demo-selective-full-history-v6';
// Apply the new daily budget prospectively. Earlier experiments retain their original accounting.
export const DEMO_CONSISTENCY_START = Date.parse('2026-11-13T21:45:00Z');
const brtDay = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
});
export type ConsistencyOrder = {
  id: string;
  entry_strategy: string;
  entry_minute: string;
  account_type: string;
  status: string;
  result: string;
  iq_option_id: string | null;
  profit: number | string | null;
  settled_at: string | null;
};
type Reason = { code: string; details: Record<string, number | string | null> };
type Signal = {
  quality: number;
  payout: number | null;
  candleContext: { bodyShare: number; rangeMultiple: number | null; minuteMove: number; minuteEfficiency: number };
};
type Evidence = {
  wins: number; losses: number; halfHourBlocks: number; netReturn: number | null;
  recentDecisive?: number; recentNetReturn?: number | null;
};

export function demoConsistencySince(target: number): string {
  // Read a full day, then filter by the Brasília date in demoConsistencyBudget.
  return new Date(Math.max(DEMO_CONSISTENCY_START, target - 24 * 60 * 60_000)).toISOString();
}

export function demoConsistencyBudget(rows: readonly ConsistencyOrder[] | null, strategy: string, target: number) {
  const seen = new Set<string>();
  const day = brtDay.format(target);
  const orders = (rows ?? []).filter(row => {
    const entry = Date.parse(row.entry_minute);
    if (seen.has(row.id) || row.entry_strategy !== strategy || row.account_type !== 'PRACTICE'
      || !['confirmed', 'reserved', 'unknown'].includes(row.status)
      || !(entry >= DEMO_CONSISTENCY_START && entry <= target) || brtDay.format(entry) !== day) return false;
    seen.add(row.id);
    return true;
  });
  const closed = orders.filter(row => row.status === 'confirmed' && /^\d+$/.test(row.iq_option_id ?? '')
    && Number.isFinite(Date.parse(row.settled_at ?? '')) && Date.parse(row.settled_at!) < target);
  const losses = closed.filter(row => row.result === 'loss' && row.profit !== null && Number(row.profit) < 0).length;
  const latest = orders.reduce((last, row) => Math.max(last, Date.parse(row.entry_minute)), 0);
  const waitSeconds = Math.max(0, (60_000 - (target - latest)) / 1000);
  const details = { entries_today: orders.length, losses_today: losses, wait_seconds: waitSeconds, maximum_entries: 100 };
  let reason: Reason | null = null;
  if (!rows) reason = { code: 'selective_ledger_unavailable', details };
  else if (orders.length >= 100) reason = { code: 'selective_daily_entry_limit', details };
  else if (waitSeconds > 0) reason = { code: 'selective_spacing', details };
  return { reason, entries: orders.length, losses, waitSeconds, lossPauseEnabled: false };
}

export function demoConsistencySignal(
  signal: Signal,
  evidence: Evidence,
  expectedReturn: number | null,
  entriesToday: number,
): { reason: Reason | null; mode: 'supported' | 'exploratory' } {
  const supported = evidence.wins + evidence.losses >= 20 && evidence.halfHourBlocks >= 4;
  const mode = supported ? 'supported' : 'exploratory';
  const { bodyShare, rangeMultiple, minuteMove, minuteEfficiency } = signal.candleContext;
  const details = {
    quality: signal.quality, payout: signal.payout, candle_body: bodyShare,
    range_multiple: rangeMultiple, minute_efficiency: minuteEfficiency, mode,
    historical_net_return: evidence.netReturn, expected_return: expectedReturn,
    entries_today: entriesToday,
  };
  const reject = (code: string) => ({ reason: { code, details }, mode });
  if (!supported) return reject('selective_history_insufficient');
  if (signal.payout === null || !Number.isFinite(signal.payout) || signal.payout < 0.8 || signal.payout > 1) {
    return reject('selective_payout');
  }
  if (!Number.isFinite(signal.quality) || signal.quality < 70) return reject('selective_quality');
  if (!Number.isFinite(bodyShare) || bodyShare < 0.5) return reject('selective_candle_body');
  if (rangeMultiple === null || !Number.isFinite(rangeMultiple) || rangeMultiple < 0.8 || rangeMultiple > 1.8) {
    return reject('selective_candle_range');
  }
  if (!Number.isFinite(minuteEfficiency) || minuteEfficiency < 0.35
    || !Number.isFinite(minuteMove) || minuteMove <= 0) return reject('selective_minute_confirmation');
  if (evidence.netReturn === null || !Number.isFinite(evidence.netReturn) || evidence.netReturn <= 0
    || expectedReturn === null || !Number.isFinite(expectedReturn) || expectedReturn < 0.02) return reject('selective_return');
  if ((evidence.recentDecisive ?? 0) >= 20 && (evidence.recentNetReturn ?? 0) <= 0) return reject('selective_recent_return');
  return { reason: null, mode };
}
