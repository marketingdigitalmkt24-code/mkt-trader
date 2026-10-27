import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { displayedDemoScore, readDemoScoreHistory } from '@/lib/demo-score-history';
import type { NoteScoreSummary } from '@/lib/demo-strategy-scores';
import { DemoScoreOperations } from './DemoScoreOperations';
import { Button } from './ui/button';

export function DemoWinningScoreOperations({ row, userId }: { row: NoteScoreSummary; userId: string }) {
 const query = useQuery({
  queryKey: ['demo-winning-score-operations', userId, row.score, row.strategies, row.firstWinAt, row.lastWinAt, row.demoWins],
  refetchInterval: 10000,
  queryFn: async () => {
   // Read only the contributing cohorts and the selected period's WIN span.
   const orders = await readDemoScoreHistory(async (from, to) => {
    const { data, error } = await supabase.from('iq_demo_test_orders')
     .select('id,signal_id,entry_strategy,entry_minute,settled_at,status,result,profit,iq_option_id')
     .eq('status', 'confirmed').eq('account_type', 'PRACTICE').eq('result', 'win')
     .not('iq_option_id', 'is', null).in('entry_strategy', row.strategies)
     .gte('entry_minute', row.firstWinAt).lte('entry_minute', row.lastWinAt)
     .order('entry_minute', { ascending: false }).order('id', { ascending: false }).range(from, to);
    if (error) throw error;
    return data ?? [];
   }, async ids => {
    const { data, error } = await supabase.from('iq_demo_test_candidates').select('signal_id,score').in('signal_id', ids);
    if (error) throw error;
    return data ?? [];
   });
   return orders.filter(order => displayedDemoScore(order.score) === row.score && order.iq_option_id && /^\d+$/.test(order.iq_option_id)).map(order => order.id);
  },
 });
 if (query.isPending) return <p role="status" className="py-3 text-sm text-muted-foreground">Carregando operações da nota…</p>;
 if (query.isError) return <div role="alert" className="flex flex-wrap items-center gap-3 py-3"><p className="text-sm text-destructive">Não foi possível carregar o histórico desta nota.</p><Button variant="outline" size="sm" onClick={() => query.refetch()}>Tentar novamente</Button></div>;
 return <DemoScoreOperations ids={query.data} score={row.score} />;
}