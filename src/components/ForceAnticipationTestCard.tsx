import { useQuery } from '@tanstack/react-query';
import { TrendingUp } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from './ui/card';
import { Badge } from './ui/badge';

export function ForceAnticipationTestCard() {
  const { data: orders = [], isLoading, isError } = useQuery({
    queryKey: ['force-anticipation-confirmed-orders'], refetchInterval: 15000,
    queryFn: async () => {
      const { data, error } = await supabase.from('operation_results')
        .select('signal_id,asset,direction,created_at,iq_option_id,result,profit,entry_price')
        .eq('entry_strategy', 'FORCA_ANTECIPADA')
        .like('signal_id', 'forca_antecipada-%')
        .neq('timeframe', 'TEST')
        .order('created_at', { ascending: false }).limit(10);
      if (error) throw error;
      return (data || []).filter(row => /^[0-9]+$/.test(row.iq_option_id || ''));
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
      {isLoading ? <p className="text-xs text-muted-foreground">Carregando ordens…</p>
        : isError ? <p role="alert" className="text-xs text-destructive">Não foi possível carregar as ordens.</p>
        : !orders.length ? <p className="text-xs text-muted-foreground">Aguardando sinal elegível e confirmação da corretora.</p>
        : orders.map(row => <div key={row.signal_id} className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
          <span className="font-medium">{row.asset}</span>
          <span className="font-mono text-muted-foreground">{new Date(row.created_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
          <span className={row.direction === 'PUT' ? 'text-put' : 'text-call'}>{row.direction}</span>
          <span className="font-mono">#{row.iq_option_id} · {money(Number(row.entry_price))}</span>
          <span className="ml-auto font-mono">{['pending', 'open'].includes(row.result) ? 'ABERTO' : row.result.toUpperCase()} · {money(Number(row.profit))}</span>
        </div>)}
    </div>
  </CardContent></Card>;
}
