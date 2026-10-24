import { isNormalPrincipalTrend } from './normal-trend.ts';

export function selectedTrendCopyRequest(order: {
  signal_id: string; asset: string; direction: string; iq_option_id: string | null;
  entry_strategy: string | null; timeframe: string; expiration_time: string | null;
  entry_price: number;
} | null, now: number) {
  if (!order || order.signal_id.startsWith('copy-') || order.signal_id.startsWith('mt5-')
    || isNormalPrincipalTrend(order)
    || order.signal_id.startsWith('force-lw-') || order.signal_id.startsWith('forca_invertida-')
    || ['FORCE_LOSS_WIN', 'FORCA_INVERTIDA'].includes(order.entry_strategy || '')
    || !['M1', 'M5'].includes(order.timeframe)
    || !/^\d+$/.test(order.iq_option_id || '')
    || !['CALL', 'PUT'].includes(order.direction)) return null;
  const expiration = order.timeframe === 'M5' ? 5 : 1;
  const entryAt = Date.parse(order.expiration_time || '') - expiration * 60000;
  if (!Number.isFinite(entryAt) || entryAt % 60000 !== 0 || now < entryAt || now >= entryAt + 30000) return null;
  return { asset: order.asset, direction: order.direction === 'CALL' ? 'call' as const : 'put' as const,
    amount: Number(order.entry_price), expiration, signalId: order.signal_id,
    entryStrategy: order.entry_strategy || undefined, entryAt, timeframe: order.timeframe, mode: 'option' as const };
}