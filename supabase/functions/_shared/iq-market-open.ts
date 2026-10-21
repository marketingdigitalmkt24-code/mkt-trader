export type IQMarketAsset = {
  name?: string; enabled?: boolean; is_suspended?: boolean;
  schedule?: unknown;
};
// IQ binary/turbo schedule contains UTC Unix-second intervals. No schedule = unknown, not open.
export function iqMarketOpen(asset: IQMarketAsset, now: number, expiry: number) {
  if (asset.enabled !== true || asset.is_suspended !== false
    || !Number.isFinite(now) || !Number.isFinite(expiry) || expiry <= now
    || !Array.isArray(asset.schedule)) return false;
  return asset.schedule.some(interval => Array.isArray(interval) && interval.length === 2
    && interval.every(n => typeof n === 'number' && Number.isFinite(n))
    && interval[0] <= now && now < interval[1] && expiry <= interval[1]);
}