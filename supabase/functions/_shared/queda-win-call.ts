export const QUEDA_WIN_CALL = 'QUEDA_WIN_CALL_V1';
export type DemoOrderOutcome = { entry_strategy: string; entry_minute: string; result: string; asset?: string; direction?: string };
// Prospective Demo rule (user request 24/10/2026): when a confirmed "Queda" (CONTINUACAO_QUEDA_V1)
// PUT order closed WIN at minute M, enter CALL on the same asset at minute M+60.
// Only broker-confirmed wins count; ties, losses and unconfirmed orders never trigger it.
export function quedaWinCall(orders: DemoOrderOutcome[], curMin: number) {
  if (!Number.isFinite(curMin) || curMin % 60 !== 0) return null;
  const prevIso = new Date((curMin - 60) * 1000).toISOString();
  const win = orders.find(o => o.entry_strategy === 'CONTINUACAO_QUEDA_V1'
    && o.result === 'win' && o.direction === 'PUT'
    && typeof o.asset === 'string' && o.asset.length > 0
    && o.entry_minute === prevIso);
  if (!win) return null;
  return { asset: win.asset as string, direction: 'CALL' as const };
}
