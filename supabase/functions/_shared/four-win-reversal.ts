export const FOUR_WIN_STRATEGY = 'FOUR_WIN_REVERSAL';
export const FOUR_WIN_LABEL = 'Inversão após 4 ganhos';

export function canReuseBrokerSession(serviceAuthorized: boolean, sessionConfigId: string, activeConfigId: string): boolean {
  return serviceAuthorized && sessionConfigId.length > 0 && sessionConfigId === activeConfigId;
}

// The fourth win is only known when its candle closes, at the opening of the selected
// candidate's minute. Enter that SAME minute immediately; never roll forward to another.
export function nextReversalMinute(candidateMinuteMs: number): number {
  return candidateMinuteMs;
}

// Latest safe submission inside the entry minute (1-minute turbo closes purchases ~30 s before expiry).
export const REVERSAL_SUBMIT_WINDOW_MS = 30000;

export function canSendReversal(entryAt: number, nowMs: number): boolean {
  return Number.isFinite(entryAt) && entryAt % 60000 === 0 && nowMs < entryAt + REVERSAL_SUBMIT_WINDOW_MS;
}

export function invertDirection(direction: 'CALL' | 'PUT'): 'CALL' | 'PUT' {
  return direction === 'CALL' ? 'PUT' : 'CALL';
}

// Newest first; unresolved, tied or missing results interrupt the sequence.
export function hasFourWins(results: string[]): boolean {
  return results.length >= 4 && results.slice(0, 4).every(result => result === 'win');
}

// Newest-first strategies of the 4 wins: two ADJACENT VELA_FORCA wins anywhere in the
// sequence block the reversal — no IQ Option order and no Telegram. Other sequences send.
export function isBlockedByMiddleForceCandles(strategies: string[]): boolean {
  if (strategies.length < 4) return false;
  for (let i = 0; i < 3; i++) {
    if (strategies[i] === 'VELA_FORCA' && strategies[i + 1] === 'VELA_FORCA') return true;
  }
  return false;
}