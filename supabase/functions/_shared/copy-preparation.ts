import { selectedTrendCopyRequest } from './selected-trend-copy.ts';
import { TAKASHI_AFTER_226, TAKASHI_AFTER_226_PREFIX } from './takashi-after-226.ts';

export function prepareTakashiCopy(candidate: {
 signal_id: string; asset: string; direction: string; entry_strategy: string; entry_minute: string; score: number;
} | null, now: number) {
 if (!candidate || candidate.entry_strategy !== 'TAKASHI_BNF_V1' || !Number.isFinite(candidate.score)
  || Math.round(candidate.score * 100) === 0 || !['CALL', 'PUT'].includes(candidate.direction)) return null;
 const entryAt = Date.parse(candidate.entry_minute);
 if (!Number.isFinite(entryAt) || now < entryAt || now >= entryAt + 30000) return null;
 return { asset: candidate.asset, direction: candidate.direction === 'PUT' ? 'call' as const : 'put' as const,
  amount: 0, expiration: 1, signalId: TAKASHI_AFTER_226_PREFIX + candidate.signal_id,
  entryStrategy: TAKASHI_AFTER_226, entryAt, timeframe: 'M1', mode: 'option' as const };
}

type PrincipalOrder = Parameters<typeof selectedTrendCopyRequest>[0];
export const COPY_CONFIRMATION_POLL_MS = 25;
export async function waitForConfirmedCopy(
 signalId: string, entryAt: number,
 read: () => Promise<{ order: PrincipalOrder; executed: boolean }>,
 now: () => number = Date.now,
 pause: (delayMs: number) => Promise<void> = delayMs => new Promise(resolve => setTimeout(resolve, delayMs)),
) {
 while (now() < entryAt + 30000) {
  const { order, executed } = await read();
  if (executed && order?.signal_id === signalId && selectedTrendCopyRequest(order, now()))
   return { ok: true, timeframe: order.timeframe, expirationIso: order.expiration_time };
  const remainingMs = entryAt + 30000 - now();
  if (remainingMs <= 0) break;
  await pause(Math.min(COPY_CONFIRMATION_POLL_MS, remainingMs));
 }
 return { ok: false, timeframe: 'M1', expirationIso: null };
}