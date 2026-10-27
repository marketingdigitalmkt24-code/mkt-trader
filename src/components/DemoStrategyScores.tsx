import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { demoStrategyNames } from './DemoTestOperations';
import { Button } from './ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { orderStrategyScores } from '@/lib/demo-strategy-scores';
import { DemoStrategyScoreChart } from './DemoStrategyScoreChart';

export function DemoStrategyScores() {
 const { user } = useAuth();
 const [strategy, setStrategy] = useState('all');
 const [period, setPeriod] = useState('all');
 const [order, setOrder] = useState('desc');
 const [page, setPage] = useState(0);
 const queryClient = useQueryClient();
 useEffect(() => {
  if (!user) return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const refresh = () => {
   if (timer) clearTimeout(timer);
   timer = setTimeout(() => { void queryClient.invalidateQueries({ queryKey: ['demo-strategy-scores', user.id] }); }, 150);
  };
  const channel = supabase.channel(`strategy-score-outcomes-${user.id}`)
   .on('postgres_changes', { event: '*', schema: 'public', table: 'iq_demo_test_orders' }, refresh)
   .on('postgres_changes', { event: '*', schema: 'public', table: 'operation_results', filter: 'timeframe=eq.TEST' }, refresh)
   .on('postgres_changes', { event: '*', schema: 'public', table: 'iq_demo_test_candidates' }, refresh)
   .subscribe();
  return () => { if (timer) clearTimeout(timer); void supabase.removeChannel(channel); };
 }, [user?.id, queryClient]);
 const query = useQuery({
  queryKey: ['demo-strategy-scores', user?.id, period], enabled: !!user,
  refetchInterval: 10000, staleTime: 5000, refetchOnWindowFocus: 'always',
  queryFn: async () => {
   const { data, error } = await supabase.rpc('admin_winning_strategy_score_chart', { p_period: period });
   if (error) throw error;
   return (data ?? []).map(row => ({ strategy: row.strategy, score: row.score, demoWins: Number(row.demo_wins), rejectedWins: Number(row.rejected_wins), losses: Number(row.losses), firstWinAt: row.first_win_at, lastWinAt: row.last_win_at, historyFirstWinAt: row.history_first_win_at }));
  },
 });
 const strategies = useMemo(() => [...new Set((query.data ?? []).map(row => row.strategy))].sort(), [query.data]);
 const groups = useMemo(() => orderStrategyScores((query.data ?? []).filter(row => strategy === 'all' || row.strategy === strategy), order), [query.data, strategy, order]);
 const pages = Math.max(1, Math.ceil(groups.length / 20));
 const current = Math.min(page, pages - 1);
 return <section aria-label="Estratégias" className="space-y-5">
  <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">Estratégias</h2><Button variant="outline" size="sm" disabled={query.isFetching} onClick={() => query.refetch()} className="gap-2"><RefreshCw className={`h-4 w-4 ${query.isFetching ? 'animate-spin' : ''}`} />Atualizar</Button></div>
  <div className="flex flex-wrap gap-3">
   <Select value={strategy} onValueChange={value => { setStrategy(value); setPage(0); }}><SelectTrigger className="w-60 max-w-full" aria-label="Estratégia"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todas as estratégias</SelectItem>{strategies.map(value => <SelectItem key={value} value={value}>{demoStrategyNames[value] ?? value}</SelectItem>)}</SelectContent></Select>
   <Select value={period} onValueChange={value => { setPeriod(value); setPage(0); }}><SelectTrigger className="w-48 max-w-full" aria-label="Período"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todo o histórico</SelectItem><SelectItem value="today">Hoje · Brasília</SelectItem><SelectItem value="7d">Últimos 7 dias</SelectItem></SelectContent></Select>
   <Select value={order} onValueChange={value => { setOrder(value); setPage(0); }}><SelectTrigger className="w-56 max-w-full" aria-label="Ordem das notas"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="desc">Mais WIN primeiro</SelectItem><SelectItem value="asc">Menos WIN primeiro</SelectItem></SelectContent></Select>
  </div>
  {!query.isPending && !query.isError && <DemoStrategyScoreChart rows={groups} />}
  <h3 className="text-sm font-medium">Notas com WIN e nenhum LOSS · {groups.length}</h3>
  {query.isError && <p role="alert" className="text-sm text-destructive">Não foi possível atualizar as notas por estratégia.</p>}
  {query.isPending ? <p role="status" className="text-sm text-muted-foreground">Carregando notas por estratégia…</p> : !query.isError && !groups.length ? <p className="text-sm text-muted-foreground">Nenhuma nota com WIN e zero LOSS neste período.</p> : <div className="space-y-1" aria-label="Notas por estratégia">{groups.slice(current * 20, current * 20 + 20).map(row => <div key={`${row.strategy}-${row.score}`} className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-md bg-secondary/30 p-3 text-xs">
   <span className="min-w-0 font-medium">{demoStrategyNames[row.strategy] ?? row.strategy}</span><span className="font-mono">Nota {row.score.replace('.', ',')}</span>
   <span className="text-call">Demo: {row.demoWins} WIN</span><span className="text-call">Rejeitadas: {row.rejectedWins} WIN (teste)</span><span className="ml-auto text-muted-foreground">0 LOSS</span>
  </div>)}</div>}
  {pages > 1 && <div className="flex items-center justify-between gap-2"><Button variant="outline" size="sm" disabled={!current} onClick={() => setPage(current - 1)}>Anterior</Button><span className="text-xs text-muted-foreground">{current + 1} / {pages}</span><Button variant="outline" size="sm" disabled={current + 1 >= pages} onClick={() => setPage(current + 1)}>Próxima</Button></div>}
  <p className="text-xs text-muted-foreground">Rejeitadas: resultados de teste, não ordens na corretora. Notas agrupadas em duas casas decimais. WIN no histórico não garante ganho futuro.</p>
  {query.dataUpdatedAt > 0 && <p className="text-xs text-muted-foreground">Atualizado às {new Date(query.dataUpdatedAt).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo' })} · Brasília</p>}
 </section>;
}