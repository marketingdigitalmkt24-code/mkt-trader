import { useQuery } from '@tanstack/react-query';
import { TrendingUp } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from './ui/card';
import { Badge } from './ui/badge';

export function ForceAnticipationTestCard() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['force-anticipation-orders'], refetchInterval: 15000,
    queryFn: async () => {
      const [orders, queue] = await Promise.all([
        supabase.from('operation_results').select('signal_id,asset,direction,created_at,iq_option_id,result,profit,entry_price').like('signal_id', 'forca_antecipada-%').order('created_at', { ascending: false }).limit(10).neq('timeframe', 'TEST'),
        supabase.from('trade_queue').select('signal_id,status,error').like('signal_id', 'forca_antecipada-%').in('status', ['pending', 'executing', 'failed']).order('created_at', { ascending: false }).limit(10),
      ]);
      if (orders.error || queue.error) throw orders.error || queue.error;
      return { orders: orders.data || [], queue: queue.data || [] };
    },
  });
  const money = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'USD' });
  return <Card><CardContent className="p-3 sm:p-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="flex items-center gap-2 text-sm font-semibold"><TrendingUp className="h-4 w-4 text-call" />Antecipação de Força</h3>
      <Badge variant="outline">IQ OPTION</Badge>
    </div>
    <div className="mt-3 space-y-2">
      <h4 className="text-xs font-semibold">Ordens confirmadas na IQ Option</h4>
      {!data?.orders.length ? <p className="text-xs text-muted-foreground">Aguardando sinal elegível e confirmação da corretora.</p> : data.orders.filter(row => /^[0-9]+$/.test(row.iq_option_id || '')).map(row => <div key={row.signal_id} className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
        <span className="font-medium">{row.asset}</span>
        <span className="font-mono text-muted-foreground">{new Date(row.created_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
        <span className={row.direction === 'PUT' ? 'text-put' : 'text-call'}>{row.direction}</span>
        <span className="font-mono">#{row.iq_option_id} · {money(Number(row.entry_price))}</span>
        <span className="ml-auto font-mono">{['pending', 'open'].includes(row.result) ? 'ABERTO' : row.result.toUpperCase()} · {money(Number(row.profit))}</span>
      </div>)}
      {data?.queue.filter(row => row.status === 'failed').map(row => <p key={row.signal_id} className="text-xs text-muted-foreground">Sem ordem confirmada: {row.error || 'entrada recusada'}</p>)}
    </div>
    {isLoading ? <p className="mt-3 text-xs text-muted-foreground">Carregando…</p> : isError ? <p role="alert" className="mt-3 text-xs text-destructive">Não foi possível carregar as ordens.</p> : null}
  </CardContent></Card>;
}
