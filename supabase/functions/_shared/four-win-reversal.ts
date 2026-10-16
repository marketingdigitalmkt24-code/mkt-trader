export const FOUR_WIN_STRATEGY = 'FOUR_WIN_REVERSAL';
export const FOUR_WIN_LABEL = 'Inversão após 4 ganhos';

// Never roll a selected candidate forward when its next-minute deadline is missed.
export function nextReversalMinute(candidateMinuteMs: number): number {
  return candidateMinuteMs + 60000;
}

export function canSendReversal(entryAt: number, nowMs: number): boolean {
  return Number.isFinite(entryAt) && entryAt % 60000 === 0 && nowMs < entryAt;
}

export function invertDirection(direction: 'CALL' | 'PUT'): 'CALL' | 'PUT' {
  return direction === 'CALL' ? 'PUT' : 'CALL';
}

// Newest first; unresolved, tied or missing results interrupt the sequence.
export function hasFourWins(results: string[]): boolean {
  return results.length >= 4 && results.slice(0, 4).every(result => result === 'win');
}