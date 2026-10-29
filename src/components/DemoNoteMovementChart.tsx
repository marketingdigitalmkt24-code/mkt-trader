import { useQuery } from '@tanstack/react-query';
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts';
import { supabase } from '@/integrations/supabase/client';
import { readDemoScoreHistory } from '@/lib/demo-score-history';
import { winningNoteDailyMovement } from '@/lib/demo-strategy-scores';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from './ui/chart';

const config = { entered: { label: 'Entraram', color: 'hsl(var(--call))' }, exited: { label: 'Saíram', color: 'hsl(var(--put))' } };
const dayLabel = (day: string) => `${day.slice(8, 10)}/${day.slice(5, 7)}`;

export function DemoNoteMovementChart({ userId }: { userId: string }) {
 const query = useQuery({
  queryKey: ['demo-note-movement', userId], staleTime: 5000, refetchInterval: 10000, refetchOnWindowFocus: 'always',
  queryFn: async () => {
   // Full paginated metadata is necessary: an older LOSS permanently blocks a cohort.
   // This independent query must not delay the winning-note list or fetch candle payloads.
   const rows = await readDemoScoreHistory(async (from, to) => {
    const { data, error } = await supabase.from('iq_demo_test_orders')
     .select('id,signal_id,entry_strategy,entry_minute,settled_at,status,result,profit,iq_option_id')
     .eq('status', 'confirmed').in('account_type',['PRACTICE','REAL']).in('result', ['win', 'loss'])
     .not('iq_option_id', 'is', null).order('entry_minute').order('id').range(from, to);
    if (error) throw error;
    return data ?? [];
   }, async ids => {
    const { data, error } = await supabase.from('iq_demo_test_candidates').select('signal_id,score').in('signal_id', ids);
    if (error) throw error;
    return data ?? [];
   });
   return winningNoteDailyMovement(rows.filter(row => row.iq_option_id && /^\d+$/.test(row.iq_option_id))
    .map(row => ({ ...row, entry_strategy: row.entry_strategy ?? '', source: 'demo' as const })));
  },
 });
 const totals = (query.data ?? []).reduce((total, day) => ({ entered: total.entered + day.entered, exited: total.exited + day.exited }), { entered: 0, exited: 0 });
 return <div className="min-w-0 space-y-3 border-b border-border pb-5" aria-label="Movimento das notas em 30 dias">
  <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="text-sm font-semibold">Notas que entraram e saíram · 30 dias</h3>{query.data && <div className="flex gap-4 text-xs font-mono"><span className="text-call">Entraram: {totals.entered}</span><span className="text-put">Saíram: {totals.exited}</span></div>}</div>
  {query.isPending ? <p role="status" className="flex h-64 items-center justify-center text-sm text-muted-foreground">Carregando movimento das notas…</p> : query.isError ? <p role="alert" className="py-8 text-sm text-destructive">Não foi possível atualizar o movimento diário das notas.</p> : <ChartContainer config={config} className="h-64 w-full aspect-auto" aria-label="Gráfico diário de notas que entraram e saíram">
   <LineChart data={query.data} margin={{ left: 0, right: 12, top: 8, bottom: 8 }}><CartesianGrid vertical={false} /><XAxis dataKey="day" tickFormatter={dayLabel} minTickGap={30} /><YAxis allowDecimals={false} width={40} /><ChartTooltip content={<ChartTooltipContent labelFormatter={(_, payload) => { const day = String(payload[0]?.payload.day ?? ''); return `${dayLabel(day)}/${day.slice(0, 4)} · Brasília`; }} />} /><Line type="linear" dataKey="entered" stroke="var(--color-entered)" strokeWidth={2} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} /><Line type="linear" dataKey="exited" stroke="var(--color-exited)" strokeWidth={2} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} /></LineChart>
  </ChartContainer>}
  <p className="text-xs text-muted-foreground">Entraram: primeiro WIN sem LOSS anterior. Saíram: primeiro LOSS que retirou a nota da lista. Histórico reconstruído pelos resultados Demo · Brasília.</p>
 </div>;
}