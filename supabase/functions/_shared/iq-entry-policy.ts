export function configuredEntryAmount(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}
export function hasOpenIQOrder(rows: { result: string }[]): boolean {
  return rows.some(r => r.result === 'pending' || r.result === 'open');
}
export function canMirrorToBroker(
  master: { user_id: string; email: string; account_type: string },
  client: { user_id: string; email: string; account_type: string },
): boolean {
  if (master.user_id === client.user_id) return false;
  return master.email.trim().toLowerCase() !== client.email.trim().toLowerCase()
    || master.account_type !== client.account_type;
}