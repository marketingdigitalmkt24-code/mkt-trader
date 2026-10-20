export function configuredEntryAmount(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}
export function hasOpenIQOrder(rows: { result: string }[]): boolean {
  return rows.some(r => r.result === 'pending' || r.result === 'open');
}