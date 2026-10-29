export type RecoveryOrder = { status: string; result: string; account_type: string; iq_option_id: string | null; amount: number | string; profit: number | string; recovery_level: number; recovery_loss: number | string; recovery_base: number | string | null };
export function demoRecoveryPredecessor<T extends RecoveryOrder & { expiration_time: string; entry_minute: string }>(orders: T[], now: number): T | null {
  return orders.filter(order => ['PRACTICE','REAL'].includes(order.account_type) && (order.status === 'confirmed'
    || (['unknown', 'reserved'].includes(order.status) && (order.iq_option_id !== null
      || !Number.isFinite(Date.parse(order.expiration_time)) || Date.parse(order.expiration_time) > now))))
    .sort((a, b) => Date.parse(b.entry_minute) - Date.parse(a.entry_minute))[0] ?? null;
}
export function demoRecovery(previous: RecoveryOrder | null, base: number, payout: number | null) {
  const initial = { amount: base, recovery_level: 0, recovery_loss: 0, recovery_base: base, recovery_payout: payout };
  if (!previous) return initial;
  if (previous.status === 'unknown' || previous.status === 'reserved' || (previous.status === 'confirmed' && previous.result === 'pending')) return null;
  if (previous.status !== 'confirmed' || !['PRACTICE','REAL'].includes(previous.account_type) || !previous.iq_option_id || !/^\d+$/.test(previous.iq_option_id)) return initial;
  if (previous.result === 'win' || (previous.result === 'loss' && previous.recovery_level >= 4)) return initial;
  if (previous.result !== 'loss' && previous.result !== 'tie') return null;
  const level = previous.result === 'loss' ? previous.recovery_level + 1 : previous.recovery_level;
  if (level === 0) return initial;
  const loss = Number(previous.recovery_loss) + (previous.result === 'loss' ? Math.abs(Number(previous.profit)) : 0);
  const cycleBase = Number(previous.recovery_base) || base;
  if (!Number.isFinite(loss) || loss < 0) return null;
  const previousAmount = Number(previous.amount);
  if (!Number.isFinite(previousAmount) || previousAmount <= 0) return null;
  const amount = Math.round(previousAmount * (previous.result === 'loss' ? 2 : 1) * 100) / 100;
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return { amount, recovery_level: level, recovery_loss: loss, recovery_base: cycleBase, recovery_payout: payout };
}