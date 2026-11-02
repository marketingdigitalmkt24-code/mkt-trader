// Combined Demo strategy: Ichimoku and Recuo na média 21 must both fire on the same
// closed candle in the same direction. Returns that direction, or null otherwise.
export function ichimokuRecuo21Direction(fired: [string, 'CALL' | 'PUT'][]): 'CALL' | 'PUT' | null {
  const ichimoku = fired.find(([s]) => s === 'ICHIMOKU')?.[1];
  const recuo = fired.find(([s]) => s === 'RECUO_EMA21')?.[1];
  return ichimoku && ichimoku === recuo ? ichimoku : null;
}
