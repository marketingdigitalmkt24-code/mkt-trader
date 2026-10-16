export const FOUR_WIN_STRATEGY = 'FOUR_WIN_REVERSAL';
export const FOUR_WIN_LABEL = 'Inversão após 4 ganhos';

export function invertDirection(direction: 'CALL' | 'PUT'): 'CALL' | 'PUT' {
  return direction === 'CALL' ? 'PUT' : 'CALL';
}

// Newest first; unresolved, tied or missing results interrupt the sequence.
export function hasFourWins(results: string[]): boolean {
  return results.length >= 4 && results.slice(0, 4).every(result => result === 'win');
}