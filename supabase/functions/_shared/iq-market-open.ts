export type IQMarketAsset = {
  name?: string; enabled?: boolean; is_suspended?: boolean;
  schedule?: unknown;
  option?: { start_time?: number; expiration_times?: number[] };
};
// IQ binary/turbo schedule contains UTC Unix-second intervals. No schedule = unknown, not open.
export function iqMarketOpen(asset: IQMarketAsset, now: number, expiry: number) {
  if (asset.enabled !== true || asset.is_suspended !== false
    || !Number.isFinite(now) || !Number.isFinite(expiry) || expiry <= now
    || !Array.isArray(asset.schedule)
    || !asset.option?.expiration_times?.includes(60)
    || typeof asset.option.start_time !== 'number' || !Number.isFinite(asset.option.start_time)
    || now < asset.option.start_time) return false;
  return asset.schedule.some(interval => Array.isArray(interval) && interval.length === 2
    && interval.every(n => typeof n === 'number' && Number.isFinite(n))
    && interval[0] <= now && now < interval[1] && expiry <= interval[1]);
}