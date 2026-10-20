export function configuredEntryAmount(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}
export function hasOpenIQOrder(rows: { result: string }[]): boolean {
  return rows.some(r => r.result === 'pending' || r.result === 'open');
}
export function canReleaseRefusedIQLease(error: string | undefined): boolean {
  return /invalid instrument|not available|não disponível|não enviada|não enviado|não confirmada|entrada cancelada|insufficient|not enough/i.test(error || '');
}
export function canMirrorToBroker(
  master: { user_id: string; email: string; account_type: string },
  client: { user_id: string; email: string; account_type: string },
): boolean {
  return master.user_id !== client.user_id;
}