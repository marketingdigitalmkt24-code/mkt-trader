import { freshDemoCandidate, validDemoTestAmount } from './demo-test-policy.ts';
import { demoAlternationAuthorized } from './demo-226-policy.ts';
import { DEMO_CANDLE_SEC } from './demo-timing.ts';
import { iqMarketOpen, type IQMarketAsset } from './iq-market-open.ts';

type Candidate = { signal_id: string; created_at: string; direction: string; entry_strategy: string; _score: number };
export function preparedDemoOrder(candidate: Candidate, amount: number, balanceId: number,
  activeId: number, asset: IQMarketAsset, now: number) {
  const expiry = Date.parse(candidate.created_at) / 1000 + DEMO_CANDLE_SEC;
  if (!freshDemoCandidate({ ...candidate, timeframe: 'TEST' }, now)
    || !demoAlternationAuthorized(candidate._score, candidate.entry_strategy)
    || !validDemoTestAmount(amount) || !Number.isInteger(balanceId) || balanceId <= 0
    || !Number.isInteger(activeId) || activeId <= 0
    || !iqMarketOpen(asset, Math.floor(now / 1000), expiry)) return null;
  return { price: amount, active_id: activeId, expired: expiry,
    direction: candidate.direction.toLowerCase(), option_type_id: 3, user_balance_id: balanceId };
}