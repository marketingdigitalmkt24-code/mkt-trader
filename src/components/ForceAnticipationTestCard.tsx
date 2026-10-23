import { useQuery } from '@tanstack/react-query';
import { TrendingUp } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from './ui/card';
import { Badge } from './ui/badge';

export function ForceAnticipationTestCard() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['force-anticipation-tests'], refetchInterval: 15000,
    queryFn: async () => {
      const PAVIO = 'anticipation-pavio-%';
      const count = (result: string, pavio: boolean) => {
        const q = supabase.from('force_anticipation_tests').select('id', { count: 'exact', head: true }).eq('result', result);
        return pavio ? q.like('signal_id', PAVIO) : q.not('signal_id', 'like', PAVIO);
      };
      const [recent, wins, losses, ties, pWins, pLosses] = await Promise.all([
        supabase.from('force_anticipation_tests').select('id,signal_id,asset,direction,created_at,result,profit').order('created_at', { ascending: false }).limit(10),
        count('win', false),
        count('loss', false),
        count('tie', false), count('win', true), count('loss', true),
      ]);
      for (const result of [recent, wins, losses, ties, pWins, pLosses]) if (result.error) throw result.error;
      const ids = (recent.data || []).map(row => `forca_antecipada-${row.id}`);
      const [orders, queue] = ids.length ? await Promise.all([
        supabase.from('operation_results').select('signal_id,asset,direction,created_at,iq_option_id,result,profit,entry_price').in('signal_id', ids).neq('timeframe', 'TEST'),
        supabase.from('trade_queue').select('signal_id,status,error').in('signal_id', ids),
      ]) : [{ data: [], error: null }, { data: [], error: null }];
      if (orders.error || queue.error) throw orders.error || queue.error;
      return { rows: recent.data || [], orders: orders.data || [], queue: queue.data || [], wins: wins.count || 0, losses: losses.count || 0, ties: ties.count || 0, pWins: pWins.count || 0, pLosses: pLosses.count || 0 };
    },
  });
  const wins = data?.wins || 0, losses = data?.losses || 0;
  const money = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'USD' });
  return <Card><CardContent className="p-3 sm:p-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="flex items-center gap-2 text-sm font-semibold"><TrendingUp className="h-4 w-4 text-call" />Antecipação de Força</h3>
      <Badge variant="outline">IQ OPTION</Badge>
    </div>
    <div className="mt-3 space-y-2 border-b pb-3">
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
    <h4 className="mt-3 text-xs font-semibold">Resultados simulados · TESTE</h4>
    <div className="my-3 flex flex-wrap gap-x-4 gap-y-1 text-xs font-mono">
      <span className="text-call">{wins} WIN</span><span className="text-put">{losses} LOSS</span>
      <span className="text-muted-foreground">{data?.ties || 0} EMPATE</span>
      <span>{wins + losses ? `${(100 * wins / (wins + losses)).toFixed(1)}%` : '—'}</span>
      <span className={wins * 8.5 - losses * 10 >= 0 ? 'text-call' : 'text-put'}>{money(wins * 8.5 - losses * 10)} simulado</span>
    </div>
    <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs font-mono">
      <span className="font-sans font-semibold">Rejeição por pavio · TESTE</span>
      <span className="text-call">{data?.pWins || 0} WIN</span><span className="text-put">{data?.pLosses || 0} LOSS</span>
      <span>{(data?.pWins || 0) + (data?.pLosses || 0) ? `${(100 * (data?.pWins || 0) / ((data?.pWins || 0) + (data?.pLosses || 0))).toFixed(1)}%` : '—'}</span>
    </div>
    {isLoading ? <p className="text-xs text-muted-foreground">Carregando testes…</p> : isError ? <p role="alert" className="text-xs text-destructive">Não foi possível carregar os testes.</p> : !data?.rows.length ? <p className="text-xs text-muted-foreground">Aguardando primeiro sinal elegível.</p> :
      <div className="space-y-2">{data.rows.map(row => <div key={row.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t pt-2 text-xs">
        <span className="font-medium">{row.asset}</span><span className="text-muted-foreground font-mono">{new Date(row.created_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
        <span className={row.direction === 'PUT' ? 'text-put' : 'text-call'}>{row.direction}</span>{row.signal_id.startsWith('anticipation-pavio-') && <Badge variant="outline">PAVIO</Badge>}<span className="ml-auto font-mono">{row.result === 'open' ? 'ABERTO' : row.result === 'expired' ? 'SEM RESULTADO' : row.result === 'tie' ? 'EMPATE' : row.result.toUpperCase()} · {money(Number(row.profit))}</span>
      </div>)}</div>}
  </CardContent></Card>;
}