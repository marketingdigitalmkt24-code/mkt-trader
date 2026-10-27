import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { readDemoScoreHistory } from '@/lib/demo-score-history';
import { readAllScorePages, winningStrategyScores, filterStrategyScorePeriod, type StrategyScoreOutcome } from '@/lib/demo-strategy-scores';
import { demoStrategyNames } from './DemoTestOperations';
import { Button } from './ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';

export function DemoStrategyScores() {
 const { user } = useAuth();
 const [strategy, setStrategy] = useState('all');
 const [period, setPeriod] = useState('all');
 const [page, setPage] = useState(0);
 const query = useQuery({
  queryKey: ['demo-strategy-scores', user?.id], enabled: !!user, refetchInterval: 30000,
  queryFn: async (): Promise<StrategyScoreOutcome[]> => {
   const [orders, rejected, tests] = await Promise.all([
    readDemoScoreHistory(async (from, to) => {
     const { data, error } = await supabase.from('iq_demo_test_orders')
      .select('id,signal_id,entry_strategy,entry_minute,settled_at,status,result,profit,iq_option_id')
      .eq('status', 'confirmed').eq('account_type', 'PRACTICE').not('iq_option_id', 'is', null)
      .order('entry_minute').order('id').range(from, to);
     if (error) throw error;
     return data ?? [];
    }, async ids => {
     const { data, error } = await supabase.from('iq_demo_test_candidates').select('signal_id,score').in('signal_id', ids);
     if (error) throw error;
     return data ?? [];
    }),
    readAllScorePages(async (from, to) => {
     const { data, error } = await supabase.from('demo_selection_rejections')
      .select('id,signal_id,entry_strategy,entry_minute,score').order('entry_minute').order('id').range(from, to);
     if (error) throw error;
     return data ?? [];
    }),
    readAllScorePages(async (from, to) => {
     const { data, error } = await supabase.from('operation_results').select('id,signal_id,result')
      .eq('timeframe', 'TEST').in('result', ['win', 'loss']).order('id').range(from, to);
     if (error) throw error;
     return data ?? [];
    }),
   ]);
   const outcomes = new Map(tests.map(row => [row.signal_id, row.result]));
   return [
    ...orders.filter(row => row.iq_option_id && /^\d+$/.test(row.iq_option_id)).map(row => ({ signal_id: row.signal_id, entry_strategy: row.entry_strategy ?? 'unknown', entry_minute: row.entry_minute, score: row.score, result: row.result, source: 'demo' as const })),
    ...rejected.flatMap(row => {
     const result = outcomes.get(row.signal_id);
     return result ? [{ ...row, result, source: 'rejected' as const }] : [];
    }),
   ];
  },
 });
 const strategies = useMemo(() => [...new Set((query.data ?? []).map(row => row.entry_strategy))].sort(), [query.data]);
 const groups = useMemo(() => winningStrategyScores(filterStrategyScorePeriod(query.data ?? [], period))
  .filter(row => strategy === 'all' || row.strategy === strategy), [query.data, period, strategy]);
 const pages = Math.max(1, Math.ceil(groups.length / 20));
 const current = Math.min(page, pages - 1);
 return <section aria-label="Estratégias" className="space-y-5">
  <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">Estratégias</h2><Button variant="outline" size="sm" disabled={query.isFetching} onClick={() => query.refetch()} className="gap-2"><RefreshCw className={`h-4 w-4 ${query.isFetching ? 'animate-spin' : ''}`} />Atualizar</Button></div>
  <div className="flex flex-wrap gap-3">
   <Select value={strategy} onValueChange={value => { setStrategy(value); setPage(0); }}><SelectTrigger className="w-60 max-w-full" aria-label="Estratégia"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todas as estratégias</SelectItem>{strategies.map(value => <SelectItem key={value} value={value}>{demoStrategyNames[value] ?? value}</SelectItem>)}</SelectContent></Select>
   <Select value={period} onValueChange={value => { setPeriod(value); setPage(0); }}><SelectTrigger className="w-48 max-w-full" aria-label="Período"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todo o histórico</SelectItem><SelectItem value="today">Hoje · Brasília</SelectItem><SelectItem value="7d">Últimos 7 dias</SelectItem></SelectContent></Select>
  </div>
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