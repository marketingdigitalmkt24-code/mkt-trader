export const QUEDA_WIN_CALL = 'QUEDA_WIN_CALL_V1';
export const QUEDA_WIN_RETRY = 'QUEDA_WIN_RETRY_V1';
export type DemoOrderOutcome = { entry_strategy: string; entry_minute: string; result: string; asset?: string; direction?: string; status?: string; iq_option_id?: string };
const confirmed = (o: DemoOrderOutcome) => o.status === 'confirmed' && /^\d+$/.test(o.iq_option_id || '');
// Prospective Demo rule (user request 24/10/2026): when a confirmed "Queda" (CONTINUACAO_QUEDA_V1)
// PUT order closed WIN at minute M, enter CALL on the same asset at minute M+60.
// Only broker-confirmed wins count; ties, losses and unconfirmed orders never trigger it.
export function quedaWinCall(orders: DemoOrderOutcome[], curMin: number) {
  if (!Number.isFinite(curMin) || curMin % 60 !== 0) return null;
  const prevIso = new Date((curMin - 60) * 1000).toISOString();
  const win = orders.find(o => confirmed(o) && o.entry_strategy === 'CONTINUACAO_QUEDA_V1'
    && o.result === 'win' && o.direction === 'PUT'
    && typeof o.asset === 'string' && o.asset.length > 0
    && o.entry_minute === prevIso);
  if (!win) return null;
  return { asset: win.asset as string, direction: 'CALL' as const };
}
// One additional Demo CALL only after the original Queda win loses; retries never trigger retries.
export function quedaWinRetry(orders: DemoOrderOutcome[], curMin: number) {
  if (!Number.isFinite(curMin) || curMin % 60 !== 0) return null;
  const prevIso = new Date((curMin - 60) * 1000).toISOString();
  const loss = orders.find(o => confirmed(o) && o.entry_strategy === QUEDA_WIN_CALL
    && o.result === 'loss' && o.direction === 'CALL' && o.entry_minute === prevIso
    && typeof o.asset === 'string' && o.asset.length > 0);
  if (!loss?.asset) return null;
  return { asset: loss.asset, direction: 'CALL' as const };
}
