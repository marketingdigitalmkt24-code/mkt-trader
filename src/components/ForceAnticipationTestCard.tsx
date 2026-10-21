import { useQuery } from '@tanstack/react-query';
import { TrendingUp } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from './ui/card';
import { Badge } from './ui/badge';

export function ForceAnticipationTestCard() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['force-anticipation-tests'], refetchInterval: 15000,
    queryFn: async () => {
      const [recent, wins, losses, ties] = await Promise.all([
        supabase.from('force_anticipation_tests').select('id,asset,direction,created_at,result,profit').order('created_at', { ascending: false }).limit(10),
        supabase.from('force_anticipation_tests').select('id', { count: 'exact', head: true }).eq('result', 'win'),
        supabase.from('force_anticipation_tests').select('id', { count: 'exact', head: true }).eq('result', 'loss'),
        supabase.from('force_anticipation_tests').select('id', { count: 'exact', head: true }).eq('result', 'tie'),
      ]);
      for (const result of [recent, wins, losses, ties]) if (result.error) throw result.error;
      return { rows: recent.data || [], wins: wins.count || 0, losses: losses.count || 0, ties: ties.count || 0 };
    },
  });
  const wins = data?.wins || 0, losses = data?.losses || 0;
  const money = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'USD' });
  return <Card><CardContent className="p-3 sm:p-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="flex items-center gap-2 text-sm font-semibold"><TrendingUp className="h-4 w-4 text-call" />Antecipação de Força</h3>
      <Badge variant="outline">TESTE</Badge>
    </div>
    <div className="my-3 flex flex-wrap gap-x-4 gap-y-1 text-xs font-mono">
      <span className="text-call">{wins} WIN</span><span className="text-put">{losses} LOSS</span>
      <span className="text-muted-foreground">{data?.ties || 0} EMPATE</span>
      <span>{wins + losses ? `${(100 * wins / (wins + losses)).toFixed(1)}%` : '—'}</span>
      <span className={wins * 8.5 - losses * 10 >= 0 ? 'text-call' : 'text-put'}>{money(wins * 8.5 - losses * 10)} simulado</span>
    </div>
    {isLoading ? <p className="text-xs text-muted-foreground">Carregando testes…</p> : isError ? <p role="alert" className="text-xs text-destructive">Não foi possível carregar os testes.</p> : !data?.rows.length ? <p className="text-xs text-muted-foreground">Aguardando primeiro sinal elegível.</p> :
      <div className="space-y-2">{data.rows.map(row => <div key={row.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t pt-2 text-xs">
        <span className="font-medium">{row.asset}</span><span className="text-muted-foreground font-mono">{new Date(row.created_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
        <span className="text-call">CALL</span><span className="ml-auto font-mono">{row.result === 'open' ? 'ABERTO' : row.result === 'expired' ? 'SEM RESULTADO' : row.result === 'tie' ? 'EMPATE' : row.result.toUpperCase()} · {money(Number(row.profit))}</span>
      </div>)}</div>}
  </CardContent></Card>;
}