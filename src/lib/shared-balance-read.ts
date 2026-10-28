// Every broker balance read is a fresh IQ Option login. Several admin cards
// polling at once make the broker refuse the Demo routine's login, which delays
// Demo results. Share one in-flight read and reuse it for a minimum interval.
export type BalanceRead = { data: any; error: any };
export const BALANCE_MIN_INTERVAL_MS = 30000;
const cache = new Map<string, { at: number; result?: BalanceRead; inflight?: Promise<BalanceRead> }>();

export function sharedBalanceRead(
  userId: string,
  invoke: () => Promise<BalanceRead>,
  now: () => number = Date.now,
): Promise<BalanceRead> {
  const entry = cache.get(userId);
  if (entry?.inflight) return entry.inflight;
  if (entry?.result && now() - entry.at < BALANCE_MIN_INTERVAL_MS) return Promise.resolve(entry.result);
  const inflight = invoke()
    .catch(error => ({ data: null, error }))
    .then(result => {
      cache.set(userId, { at: now(), result });
      return result;
    });
  cache.set(userId, { at: entry?.at ?? 0, result: entry?.result, inflight });
  return inflight;
}

export function resetSharedBalanceCache() { cache.clear(); }
