import { selectedTrendCopyRequest } from './selected-trend-copy.ts';
import { TAKASHI_AFTER_226, TAKASHI_AFTER_226_PREFIX } from './takashi-after-226.ts';
import { CONSISTENT_NOTE, CONSISTENT_NOTE_PREFIX } from './consistent-note.ts';
import { FOUR_LOSS_FOLLOW, FOUR_LOSS_FOLLOW_PREFIX } from './four-loss-follow.ts';
import { SIGNAL_SEQUENCE, SIGNAL_SEQUENCE_PREFIX } from './signal-sequence.ts';
import { DEMO_ENTRY_STRATEGIES } from './demo-226-policy.ts';

export type CopyStrategy = 'inverted' | 'consistent' | 'follow' | 'sequence_follow' | 'sequence_inverted';

export function prepareTakashiCopy(candidate: {
 signal_id: string; asset: string; direction: string; entry_strategy: string; entry_minute: string; score: number;
} | null, now: number, strategy: CopyStrategy = 'inverted') {
 if (!candidate || !Number.isFinite(candidate.score)
  || (strategy === 'follow' || strategy.startsWith('sequence_') ? !(DEMO_ENTRY_STRATEGIES as readonly string[]).includes(candidate.entry_strategy) : candidate.entry_strategy !== 'TAKASHI_BNF_V1')
  || !['CALL', 'PUT'].includes(candidate.direction)) return null;
 const entryAt = Date.parse(candidate.entry_minute);
 if (!Number.isFinite(entryAt) || now < entryAt || now >= entryAt + 30000) return null;
 const consistent = strategy === 'consistent';
 // Nota consistente follows the signal; Takashi invertida opens the opposite direction.
 const same = candidate.direction === 'PUT' ? 'put' as const : 'call' as const;
 const opposite = same === 'put' ? 'call' as const : 'put' as const;
 // Após 4 LOSS also follows the Demo signal direction.
 const follow = strategy === 'follow';
 if (strategy === 'sequence_follow' || strategy === 'sequence_inverted')
  return { asset: candidate.asset, direction: strategy === 'sequence_follow' ? same : opposite, amount: 0, expiration: 1,
   signalId: SIGNAL_SEQUENCE_PREFIX + candidate.signal_id, entryStrategy: SIGNAL_SEQUENCE, entryAt, timeframe: 'M1', mode: 'option' as const };
 return { asset: candidate.asset, direction: consistent || follow ? same : opposite,
  amount: 0, expiration: 1, signalId: (follow ? FOUR_LOSS_FOLLOW_PREFIX : consistent ? CONSISTENT_NOTE_PREFIX : TAKASHI_AFTER_226_PREFIX) + candidate.signal_id,
  entryStrategy: follow ? FOUR_LOSS_FOLLOW : consistent ? CONSISTENT_NOTE : TAKASHI_AFTER_226, entryAt, timeframe: 'M1', mode: 'option' as const };
}

type PrincipalOrder = Parameters<typeof selectedTrendCopyRequest>[0];
export const COPY_CONFIRMATION_POLL_MS = 25;
// Start the broker's read-only profile/market handshake before the principal opens.
// The sender must still await the exact accepted principal and the client reservation.
export function prepareCopyPlacement<T>(
 confirmation: Promise<{ ok: boolean }>,
 authorize: () => Promise<boolean>,
 connect: (gate: Promise<boolean>) => Promise<T>,
) {
 const gate = confirmation.then(async opened => opened.ok && await authorize());
 return connect(gate);
}
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