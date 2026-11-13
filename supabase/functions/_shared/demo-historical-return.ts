import { DEMO_CANDLE_SEC } from './demo-timing.ts';

export const DEMO_HISTORY_POLICY = 'demo-full-history-v5';
export const DEMO_HISTORY_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;
const PRIOR_SAMPLE_SIZE = 30;
const FULL_DIVERSITY_BLOCKS = 6;
const LOSS_COOLDOWN_MS = 5 * 60_000;
const brtHour = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'America/Sao_Paulo', hour: '2-digit', hourCycle: 'h23',
});
const brtDay = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
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
type StrategyDay = { decisive: number; stake: number; net: number; lastEntry: number };
const cohortKey = (signal: Signal, hour: number) =>
  JSON.stringify([signal.entry_strategy, signal.direction, signal.asset.endsWith('-OTC'), Math.floor(hour / 4)]);
const assetKey = (signal: Signal, hour: number) =>
  JSON.stringify([signal.entry_strategy, signal.direction, signal.asset, Math.floor(hour / 4)]);

export async function readAllDemoHistoricalOrders<T extends { id: string; entry_minute: string }>(
  readPage: (cursor: T | null) => Promise<T[]>,
): Promise<T[]> {
  const rows: T[] = [];
  let cursor: T | null = null;
  for (;;) {
    const page = await readPage(cursor);
    if (!page.length) return rows;
    const last = page[page.length - 1];
    if (cursor && (last.entry_minute > cursor.entry_minute
      || (last.entry_minute === cursor.entry_minute && last.id >= cursor.id))) {
      throw new Error('History cursor did not advance');
    }
    rows.push(...page);
    if (page.length < 1000) return rows;
    cursor = last;
  }
}

function recordOutcome(cohorts: Map<string, Cohort>, key: string, result: string, stake: number, net: number, entry: number) {
  const cohort = cohorts.get(key) ?? { wins: 0, losses: 0, ties: 0, stake: 0, net: 0, blocks: new Set<number>() };
  if (result === 'tie') cohort.ties++;
  else {
    if (result === 'win') cohort.wins++; else cohort.losses++;
    cohort.blocks.add(Math.floor(entry / (30 * 60 * 1000)));
  }
  cohort.stake += stake;
  cohort.net += net;
  cohorts.set(key, cohort);
}

function finiteNumber(value: number | string | null): number {
  return value === null || (typeof value === 'string' && !value.trim()) ? NaN : Number(value);
}

export function buildDemoHistory(rows: readonly DemoHistoricalOrder[], targetMs: number) {
  const cohorts = new Map<string, Cohort>();
  const assetCohorts = new Map<string, Cohort>();
  const recentCohorts = new Map<string, Cohort>();
  const recentAssetCohorts = new Map<string, Cohort>();
  const today = new Map<string, StrategyDay>();
  const targetDay = brtDay.format(targetMs);
  const seen = new Set<string>();
  for (const row of rows) {
    if (row.account_type !== 'PRACTICE' || row.status !== 'confirmed' || !row.iq_option_id
      || !/^\d+$/.test(row.iq_option_id) || seen.has(row.iq_option_id)
      || (row.direction !== 'CALL' && row.direction !== 'PUT') || !row.asset || !row.entry_strategy) continue;
    const entry = Date.parse(row.entry_minute);
    const expiry = Date.parse(row.expiration_time ?? '');
    const settled = Date.parse(row.settled_at ?? '');
    if (!(Number.isFinite(entry) && entry >= 0 && expiry - entry === DEMO_CANDLE_SEC * 1000
      && settled >= expiry && settled < targetMs)) continue;
    const stake = finiteNumber(row.amount);
    const net = finiteNumber(row.profit);
    if (!(stake > 0 && Number.isFinite(stake) && Number.isFinite(net) && Math.abs(net) <= stake)) continue;
    if (!((row.result === 'win' && net > 0) || (row.result === 'loss' && net < 0)
      || (row.result === 'tie' && net === 0))) continue;
    seen.add(row.iq_option_id);
    const hour = Number(brtHour.format(entry));
    const key = cohortKey(row, hour);
    const asset = assetKey(row, hour);
    recordOutcome(cohorts, key, row.result, stake, net, entry);
    recordOutcome(assetCohorts, asset, row.result, stake, net, entry);
    if (entry >= targetMs - DEMO_HISTORY_WINDOW_MS) {
      recordOutcome(recentCohorts, key, row.result, stake, net, entry);
      recordOutcome(recentAssetCohorts, asset, row.result, stake, net, entry);
    }
    if (brtDay.format(entry) === targetDay) {
      const day = today.get(row.entry_strategy) ?? { decisive: 0, stake: 0, net: 0, lastEntry: 0 };
      day.decisive += row.result === 'tie' ? 0 : 1;
      day.stake += stake;
      day.net += net;
      day.lastEntry = Math.max(day.lastEntry, entry);
      today.set(row.entry_strategy, day);
    }
  }
  return { cohorts, assetCohorts, recentCohorts, recentAssetCohorts, today, count: seen.size };
}

export function demoHistoricalEvidence(
  history: ReturnType<typeof buildDemoHistory> | null,
  candidate: Signal,
  targetMs: number,
) {
  const hour = Number(brtHour.format(targetMs));
  const asset = assetKey(candidate, hour);
  const group = cohortKey(candidate, hour);
  const exact = history?.assetCohorts.get(asset);
  const useAsset = !!exact && exact.wins + exact.losses >= 20 && exact.blocks.size >= 4;
  const cohort = useAsset ? exact : history?.cohorts.get(group);
  const recent = useAsset ? history?.recentAssetCohorts.get(asset) : history?.recentCohorts.get(group);
  const decisive = (cohort?.wins ?? 0) + (cohort?.losses ?? 0);
  const halfHourBlocks = cohort?.blocks.size ?? 0;
  return {
    wins: cohort?.wins ?? 0,
    losses: cohort?.losses ?? 0,
    ties: cohort?.ties ?? 0,
    halfHourBlocks,
    netProfit: cohort?.net ?? null,
    netReturn: cohort ? cohort.net / cohort.stake : null,
    scope: useAsset ? 'same_asset_direction_session' : 'same_market_direction_session',
    recentDecisive: (recent?.wins ?? 0) + (recent?.losses ?? 0),
    recentNetReturn: recent ? recent.net / recent.stake : null,
    // Shrink thin or concentrated samples toward a neutral adjustment.
    weight: decisive / (decisive + PRIOR_SAMPLE_SIZE) * Math.min(1, halfHourBlocks / FULL_DIVERSITY_BLOCKS),
  };
}

export function demoPracticeLossPace(
  history: ReturnType<typeof buildDemoHistory> | null,
  strategy: string,
  targetMs: number,
  expectedReturn: number | null,
) {
  const day = history?.today.get(strategy);
  const netReturn = day ? day.net / day.stake : null;
  const remaining = day ? Math.max(0, LOSS_COOLDOWN_MS - (targetMs - day.lastEntry)) : 0;
  // Slow down this strategy only when the current setup and a meaningful daily sample are both negative.
  const waitMs = day && day.decisive >= 12 && netReturn !== null && netReturn <= -0.1
    && expectedReturn !== null && expectedReturn < 0 ? remaining : 0;
  return { waitMs, dayDecisive: day?.decisive ?? 0, dayNet: day?.net ?? null, dayNetReturn: netReturn };
}
