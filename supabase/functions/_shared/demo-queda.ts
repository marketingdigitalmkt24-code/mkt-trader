// Queda forte: three closed analysis candles in the same direction, the last body at least
// 1.5x the average body of the 20 earlier candles. Follows the move: drop -> PUT, rise -> CALL.
export type QK = { o: number; c: number };
export function detectQuedaForte(closed: QK[]): 'CALL' | 'PUT' | null {
  if (closed.length < 23) return null;
  const last3 = closed.slice(-3), base = closed.slice(-23, -3);
  const down = last3.every(k => k.c < k.o), up = last3.every(k => k.c > k.o);
  if (!down && !up) return null;
  const avg = base.reduce((s, k) => s + Math.abs(k.c - k.o), 0) / base.length;
  const lastBody = Math.abs(last3[2].c - last3[2].o);
  if (!(avg > 0) || lastBody < avg * 1.5) return null;
  return down ? 'PUT' : 'CALL';
}
