export function selectedTrendCopyRequest(order: {
  signal_id: string; asset: string; direction: string; iq_option_id: string | null;
  entry_strategy: string | null; timeframe: string; expiration_time: string | null;
  entry_price: number;
} | null, now: number) {
  if (!order || !order.signal_id.startsWith('tendencia-demo-v1-t7-')
    || order.entry_strategy !== 'TENDENCIA' || order.timeframe !== 'M1'
    || !/^\d+$/.test(order.iq_option_id || '')
    || !['CALL', 'PUT'].includes(order.direction)) return null;
  const entryAt = Date.parse(order.expiration_time || '') - 60000;
  if (!Number.isFinite(entryAt) || entryAt % 60000 !== 0 || now < entryAt || now >= entryAt + 30000) return null;
  return { asset: order.asset, direction: order.direction === 'CALL' ? 'call' as const : 'put' as const,
    amount: Number(order.entry_price), expiration: 1, signalId: order.signal_id,
    entryStrategy: 'TENDENCIA', entryAt, timeframe: 'M1', mode: 'option' as const };
}