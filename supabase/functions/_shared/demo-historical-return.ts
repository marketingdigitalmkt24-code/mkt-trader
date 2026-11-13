import { DEMO_CANDLE_SEC } from './demo-timing.ts';

export const DEMO_HISTORY_POLICY = 'demo-historical-return-v1';
export const DEMO_HISTORY_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;
const MIN_DECISIVE = 30;
const MIN_HALF_HOURS = 6;
const MIN_MARGIN = 0.02;
const Z = 1.6448536269514722; // One-sided nominal 95% Wilson bound.
const brtHour = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'America/Sao_Paulo', hour: '2-digit', hourCycle: 'h23',
});

type Signal = { entry_strategy: string; direction: string; asset: string };
export type DemoHistoricalOrder = Signal & {
  account_type: string;
  status: string;
  iq_option_id: string | null;
  entry_minute: string;
  expiration_time: string | null;
  settled_at: string | null;
  amount: number | string | null;
  profit: number | string | null;
  result: string;
};
type Cohort = { wins: number; losses: number; ties: number; stake: number; net: number; blocks: Set<number> };
const cohortKey = (signal: Signal, hour: number) =>
  JSON.stringify([signal.entry_strategy, signal.direction, signal.asset.endsWith('-OTC'), Math.floor(hour / 4)]);

function finiteNumber(value: number | string | null): number {
  return value === null || (typeof value === 'string' && !value.trim()) ? NaN : Number(value);
}

export function buildDemoHistory(rows: readonly DemoHistoricalOrder[], targetMs: number) {
  const cohorts = new Map<string, Cohort>();
  const seen = new Set<string>();
  for (const row of rows) {
    if (row.account_type !== 'PRACTICE' || row.status !== 'confirmed' || !row.iq_option_id
      || !/^\d+$/.test(row.iq_option_id) || seen.has(row.iq_option_id)
      || (row.direction !== 'CALL' && row.direction !== 'PUT') || !row.asset || !row.entry_strategy) continue;
    const entry = Date.parse(row.entry_minute);
    const expiry = Date.parse(row.expiration_time ?? '');
    const settled = Date.parse(row.settled_at ?? '');
    if (!(entry >= targetMs - DEMO_HISTORY_WINDOW_MS && expiry - entry === DEMO_CANDLE_SEC * 1000
      && settled >= expiry && settled < targetMs)) continue;
    const stake = finiteNumber(row.amount);
    const net = finiteNumber(row.profit);
    if (!(stake > 0 && Number.isFinite(stake) && Number.isFinite(net) && Math.abs(net) <= stake)) continue;
    if (!((row.result === 'win' && net > 0) || (row.result === 'loss' && net < 0)
      || (row.result === 'tie' && net === 0))) continue;
    seen.add(row.iq_option_id);
    const key = cohortKey(row, Number(brtHour.format(entry)));
    const cohort = cohorts.get(key) ?? { wins: 0, losses: 0, ties: 0, stake: 0, net: 0, blocks: new Set<number>() };
    if (row.result === 'tie') cohort.ties++;
    else {
      if (row.result === 'win') cohort.wins++; else cohort.losses++;
      cohort.blocks.add(Math.floor(entry / (30 * 60 * 1000)));
    }
    cohort.stake += stake;
    cohort.net += net;
    cohorts.set(key, cohort);
  }
  return { cohorts, count: seen.size };
}

export function assessDemoHistoricalReturn(
  history: ReturnType<typeof buildDemoHistory> | null,
  candidate: Signal & { payout: number | null },
  targetMs: number,
) {
  const cohort = history?.cohorts.get(cohortKey(candidate, Number(brtHour.format(targetMs))));
  const decisive = (cohort?.wins ?? 0) + (cohort?.losses ?? 0);
  const payout = candidate.payout;
  const validPayout = payout !== null && Number.isFinite(payout) && payout > 0 && payout <= 1;
  let lowerWinRate: number | null = null;
  if (cohort && decisive > 0) {
    const p = cohort.wins / decisive;
    const z2 = Z * Z;
    lowerWinRate = Math.max(0, (p + z2 / (2 * decisive) - Z * Math.sqrt((p * (1 - p) + z2 / (4 * decisive)) / decisive))
      / (1 + z2 / decisive));
  }
  // Price a decisive result at today's payout; ties return the stake. Historical net uses actual stakes and P&L.
  const expectedLower = validPayout && lowerWinRate !== null ? (1 + payout) * lowerWinRate - 1 : null;
  const netReturn = cohort ? cohort.net / cohort.stake : null;
  const details = {
    wins: cohort?.wins ?? 0, losses: cohort?.losses ?? 0, ties: cohort?.ties ?? 0,
    half_hour_blocks: cohort?.blocks.size ?? 0, net_profit: cohort?.net ?? null, net_return: netReturn,
    payout: validPayout ? payout : null, lower_win_rate: lowerWinRate, conservative_return: expectedLower,
    minimum_decisive: MIN_DECISIVE, minimum_half_hour_blocks: MIN_HALF_HOURS, minimum_conservative_return: MIN_MARGIN,
  };
  const code = !history ? 'history_unavailable'
    : !cohort || decisive < MIN_DECISIVE || cohort.blocks.size < MIN_HALF_HOURS ? 'history_insufficient'
    : netReturn === null || netReturn <= 0 ? 'history_nonpositive'
    : expectedLower === null ? 'history_payout_unavailable'
    : expectedLower < MIN_MARGIN ? 'history_margin_insufficient' : null;
  return { code, details };
}
