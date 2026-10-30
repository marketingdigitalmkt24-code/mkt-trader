import { useState } from 'react';
import { Minus, X } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';

import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts';
import { supabase } from '@/integrations/supabase/client';
import { readDemoScoreHistory } from '@/lib/demo-score-history';
import { winningNoteDailyMovement } from '@/lib/demo-strategy-scores';
import { ChartContainer, ChartLegend, ChartTooltip, ChartTooltipContent } from './ui/chart';
import { Button } from './ui/button';
import { DemoScoreOperations } from './DemoScoreOperations';

const config = { entered: { label: 'Entraram', color: 'hsl(var(--call))' }, exited: { label: 'Saíram', color: 'hsl(var(--put))' }, consistent: { label: 'Notas consistentes', color: 'hsl(var(--gold))' }, consistentWins: { label: 'WIN dessas notas', color: 'hsl(var(--gold-dim))' } };
const dayLabel = (day: string) => `${day.slice(8, 10)}/${day.slice(5, 7)}`;
type LegendKey = 'consistent' | 'entered' | 'exited';
const legends: { key: LegendKey; className: string }[] = [{ key: 'consistent', className: 'text-gold' }, { key: 'entered', className: 'text-call' }, { key: 'exited', className: 'text-put' }];

export function DemoNoteMovementChart({ userId }: { userId: string }) {
 const [selected, setSelected] = useState<LegendKey | null>(null);
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
   const confirmed = rows.filter(row => row.iq_option_id && /^\d+$/.test(row.iq_option_id));
   const days = winningNoteDailyMovement(confirmed.map(row => ({ ...row, entry_strategy: row.entry_strategy ?? '', source: 'demo' as const })));
   const operationIds = (key: LegendKey) => {
    const signals = new Set(days.flatMap(day => day.operationSignals[key]));
    return confirmed.filter(row => signals.has(row.signal_id))
     .sort((a, b) => Date.parse(b.entry_minute) - Date.parse(a.entry_minute) || b.id.localeCompare(a.id)).map(row => row.id);
   };
   return { days, ids: { consistent: operationIds('consistent'), entered: operationIds('entered'), exited: operationIds('exited') } };
  },
 });
 const days = query.data?.days ?? [];
 const totals = days.reduce((total, day) => ({ entered: total.entered + day.entered, exited: total.exited + day.exited }), { entered: 0, exited: 0 });
 const legendContent = () => <div className="flex flex-wrap justify-center gap-2 pt-3">{legends.map(({ key, className }) => <Button key={key} variant="ghost" size="sm" className="gap-2 text-xs" aria-expanded={selected === key} aria-controls="note-movement-operations" onClick={() => setSelected(selected === key ? null : key)}><Minus aria-hidden="true" className={`h-4 w-4 ${className}`} /><span className={selected === key ? 'underline underline-offset-4' : ''}>{config[key].label}</span></Button>)}</div>;
 return <div className="min-w-0 space-y-3 border-b border-border pb-5" aria-label="Movimento das notas em 30 dias">
  <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="text-sm font-semibold">Notas que entraram e saíram · 30 dias</h3>{query.data && <div className="flex flex-wrap gap-4 text-xs font-mono"><span className="text-call">Entraram: {totals.entered}</span><span className="text-put">Saíram: {totals.exited}</span><span className="text-gold">Consistentes hoje: {days[days.length - 1]?.consistent ?? 0}</span></div>}</div>
  {query.isPending ? <p role="status" className="flex h-64 items-center justify-center text-sm text-muted-foreground">Carregando movimento das notas…</p> : query.isError ? <p role="alert" className="py-8 text-sm text-destructive">Não foi possível atualizar o movimento diário das notas.</p> : <ChartContainer config={config} className="h-64 w-full aspect-auto" aria-label="Gráfico diário de notas que entraram e saíram">
   <LineChart data={days} margin={{ left: 0, right: 12, top: 8, bottom: 8 }}><CartesianGrid vertical={false} /><XAxis dataKey="day" tickFormatter={dayLabel} minTickGap={30} /><YAxis allowDecimals={false} width={40} /><ChartTooltip content={<ChartTooltipContent labelFormatter={(_, payload) => { const day = String(payload[0]?.payload.day ?? ''); return `${dayLabel(day)}/${day.slice(0, 4)} · Brasília`; }} />} /><Line type="linear" dataKey="consistent" stroke="var(--color-consistent)" strokeWidth={2} strokeDasharray="5 3" dot={false} activeDot={{ r: 4 }} isAnimationActive={false} /><Line type="linear" dataKey="consistentWins" stroke="transparent" dot={false} activeDot={false} legendType="none" isAnimationActive={false} /><Line type="linear" dataKey="entered" stroke="var(--color-entered)" strokeWidth={2} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} /><Line type="linear" dataKey="exited" stroke="var(--color-exited)" strokeWidth={2} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} /><ChartLegend content={legendContent} /></LineChart>
  </ChartContainer>}
  <p className="text-xs text-muted-foreground">Entraram: primeiro WIN sem LOSS anterior. Saíram: primeiro LOSS que retirou a nota da lista. Consistentes (linha tracejada dourada): notas diferentes que deram WIN no dia sem nenhum LOSS antes; o tooltip mostra quantos WIN elas somaram. Histórico reconstruído pelos resultados Demo · Brasília.</p>
  {selected && query.data && <div id="note-movement-operations" className="min-w-0 space-y-2"><div className="flex items-center justify-between"><h4 className="text-sm font-semibold">{config[selected].label} · 30 dias</h4><Button variant="ghost" size="icon" aria-label="Fechar operações da legenda" onClick={() => setSelected(null)}><X className="h-4 w-4" /></Button></div><DemoScoreOperations key={selected} ids={query.data.ids[selected]} score="all" label={config[selected].label} /></div>}
 </div>;
}