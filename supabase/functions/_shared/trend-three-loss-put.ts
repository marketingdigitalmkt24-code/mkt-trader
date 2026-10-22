export const TREND_THREE_LOSS_PUT = 'TENDENCIA_3_LOSS_PUT';
export const TREND_THREE_LOSS_LABEL = 'Tendência 3 perdas → Venda';
type Row = { entry_strategy: string | null; result: string; created_at: string; signal_id: string };

// Only the global selected t7 stream counts; shadows and combined studies do not.
export function threeTrendLosses(rows: Row[], entryAt: number): boolean {
  if (!Number.isFinite(entryAt) || entryAt % 60000 !== 0) return false;
  const selected = rows.filter(r => r.signal_id.startsWith('t7-')
    && Date.parse(r.created_at) < entryAt && Date.parse(r.created_at) >= entryAt - 180000);
  return [1, 2, 3].every(offset => {
    const minute = selected.filter(r => Date.parse(r.created_at) === entryAt - offset * 60000);
    return minute.length === 1 && minute[0].entry_strategy === 'TENDENCIA' && minute[0].result === 'loss';
  });
}

export function freshTrendPut(entryAt: number, now: number): boolean {
  return Number.isFinite(entryAt) && entryAt % 60000 === 0
    && now >= entryAt && now < entryAt + 30000;
}

export function notifyTrendPut(order: { success?: boolean; tradeId?: string }, entryAt: number, now: number): boolean {
  return order.success === true && /^\d+$/.test(order.tradeId || '')
    && now >= entryAt && now < entryAt + 60000;
}