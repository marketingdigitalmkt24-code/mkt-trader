export interface TestBrokerResult {
  signal_id: string;
  iq_option_id: string | null;
  timeframe: string;
  result: string;
  profit: number;
}

export function linkedForceBrokerResult(observation: { id: string; timeframe: string; entry_strategy?: string }, orders: TestBrokerResult[]) {
  if (observation.timeframe !== 'TEST' || observation.entry_strategy !== 'FORCA_INVERTIDA') return undefined;
  const candidateId = observation.id.replace(/:force-inverted$/, '');
  return orders.find(order => order.signal_id === `forca_invertida-${candidateId}`
    && order.timeframe !== 'TEST' && order.timeframe !== 'MT5'
    && /^\d+$/.test(order.iq_option_id ?? ''));
}