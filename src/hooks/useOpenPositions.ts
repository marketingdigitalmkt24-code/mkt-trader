import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { mergeOpenPositions, type OpenPosition } from '@/lib/open-positions';

// Cada leitura na corretora é um login: os dois quadros compartilham esta mesma
// consulta, então a IQ Option é consultada uma única vez a cada 30s.
async function fetchBrokerOpen(): Promise<OpenPosition[]> {
  const { data, error } = await supabase.functions.invoke('iqoption-open-positions');
  if (error || !data?.success) throw error ?? new Error('Falha ao consultar a corretora');
  return (data.positions ?? []) as OpenPosition[];
}

// Ordens principais confirmadas pela corretora e ainda sem resultado.
async function fetchRecordedOpen(): Promise<OpenPosition[]> {
  const { data } = await supabase.from('operation_results')
    .select('signal_id, asset, direction, iq_option_id, timeframe')
    .in('result', ['pending', 'open'])
    .neq('timeframe', 'TEST').neq('timeframe', 'MT5')
    .not('iq_option_id', 'is', null)
    .not('signal_id', 'like', 'copy-%').not('signal_id', 'like', 'sim-%').not('signal_id', 'like', 'mt5-%')
    .gte('created_at', new Date(Date.now() - 5 * 60 * 1000).toISOString())
    .limit(20);
  const rows = data || [];
  const { data: queue } = rows.length
    ? await supabase.from('trade_queue').select('signal_id, amount').in('signal_id', rows.map(r => r.signal_id))
    : { data: [] as { signal_id: string; amount: number }[] };
  const amounts = new Map((queue || []).map(q => [q.signal_id, Number(q.amount || 0)]));
  return rows.map(r => ({
    id: String(r.iq_option_id),
    type: r.timeframe === 'FOREX' ? 'forex' : 'binary-option',
    asset: r.asset,
    direction: r.direction,
    invest: amounts.get(r.signal_id) || 0,
    pnl: 0,
  }));
}

export function useOpenPositions() {
  const broker = useQuery({
    queryKey: ['broker-open-positions'],
    queryFn: fetchBrokerOpen,
    refetchInterval: 30000,
  });
  const recorded = useQuery({
    queryKey: ['recorded-open-positions'],
    queryFn: fetchRecordedOpen,
    refetchInterval: 3000,
  });

  // Corretora (com lucro ao vivo) tem prioridade; ordens registradas cobrem o intervalo entre consultas.
  return {
    openPositions: mergeOpenPositions(broker.data ?? [], recorded.data ?? []),
    isLoading: broker.isLoading || recorded.isLoading,
  };
}
