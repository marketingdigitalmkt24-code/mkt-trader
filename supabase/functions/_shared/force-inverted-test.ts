export const FORCE_INVERTED_TEST = 'FORCA_INVERTIDA';
export function forceInvertedTag(timeframe: string, strategy: string | null) {
  return timeframe === 'TEST' && strategy === 'VELA_FORCA' ? FORCE_INVERTED_TEST : null;
}
export function invertedTestOutcome(direction: string, result: string) {
  if (direction !== 'CALL' && direction !== 'PUT') return null;
  const invertedResult = result === 'win' ? 'loss' : result === 'loss' ? 'win' : result;
  return { direction: direction === 'CALL' ? 'PUT' : 'CALL', result: invertedResult,
    profit: invertedResult === 'win' ? 8.5 : invertedResult === 'loss' ? -10 : 0 };
}
