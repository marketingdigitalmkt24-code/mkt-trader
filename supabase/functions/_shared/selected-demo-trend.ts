export function freshSelectedTrend(entryAt: number, now: number): boolean {
  return Number.isFinite(entryAt) && entryAt % 60000 === 0 && now >= entryAt && now < entryAt + 30000;
}
export function selectedDemoTrend(candidate: { signal_id: string; entry_strategy: string; entry_minute: string; direction: string } | null, now: number): boolean {
  return Boolean(candidate && candidate.entry_strategy === 'TENDENCIA'
    && /^t7-.+-TENDENCIA-\d+$/.test(candidate.signal_id)
    && ['CALL', 'PUT'].includes(candidate.direction) && freshSelectedTrend(Date.parse(candidate.entry_minute), now));
}
export function notifySelectedTrend(order: { success?: boolean; tradeId?: string }, entryAt: number, now: number): boolean {
  return order.success === true && /^\d+$/.test(order.tradeId || '') && now >= entryAt && now < entryAt + 60000;
}