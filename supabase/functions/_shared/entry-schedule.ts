// Confirmed current-candle candidates never wait for another minute.
export function entrySubmissionDelay(entryAt: number, nowMs: number, leadMs = 120): number {
  if (!Number.isFinite(entryAt) || !Number.isFinite(nowMs) || entryAt % 60000 !== 0) {
    throw new Error('Invalid candle entry time');
  }
  return Math.max(0, entryAt - leadMs - nowMs);
}