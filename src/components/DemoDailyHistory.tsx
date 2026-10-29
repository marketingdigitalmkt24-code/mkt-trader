import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Calendar, History, ChevronLeft, ChevronRight, TrendingUp, TrendingDown } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from './ui/button';
import { cn } from '@/lib/utils';
import { demoDayKey, demoDailyWindow, demoDailySummaries, demoDailyPages, type DemoDailyRow } from '@/lib/demo-daily-history';

const currency = (amount: number) => amount.toLocaleString('pt-BR', { style: 'currency', currency: 'USD' });
// Na linha única, os valores de ganhos/perdas usam a forma curta para caber sem rolagem.
const shortCurrency = (amount: number) => `$${amount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function DemoDailyHistory() {
 const [page, setPage] = useState(0);
 const today = demoDayKey(new Date());
 const queryClient = useQueryClient();
 const window = demoDailyWindow(today, page);
 useEffect(() => {
  const channel = supabase.channel('demo-daily-history-live').on('postgres_changes', {event:'*',schema:'public',table:'iq_demo_test_orders'}, () => {
   void queryClient.invalidateQueries({queryKey:['demo-daily-history']});
  }).subscribe();
  return () => { void supabase.removeChannel(channel); };
 }, [queryClient]);
 const history = useQuery({ queryKey:['demo-daily-history',today,page], refetchInterval:10000, queryFn:async () => {
  const oldestQuery = supabase.from('iq_demo_test_orders').select('entry_minute').eq('account_type','PRACTICE').eq('status','confirmed').not('iq_option_id','is',null).order('entry_minute').limit(1);
  const rowsQuery = async () => {
   const rows: DemoDailyRow[] = [];
   for(let from=0; ; from+=1000) {
    const {data,error} = await supabase.from('iq_demo_test_orders').select('entry_minute,account_type,status,result,profit,iq_option_id').eq('account_type','PRACTICE').eq('status','confirmed').not('iq_option_id','is',null).gte('entry_minute',window.from).lt('entry_minute',window.to).order('entry_minute',{ascending:false}).order('id').range(from,from+999);
    if(error) throw error;
    rows.push(...(data || []));
    if((data?.length || 0)<1000) return rows;
   }
  };
  const [oldest,rows] = await Promise.all([oldestQuery,rowsQuery()]);
  if(oldest.error) throw oldest.error;
  const oldestDay = oldest.data?.[0] ? demoDayKey(new Date(oldest.data[0].entry_minute)) : today;
  return { days:demoDailySummaries(rows,window.dates), pages:demoDailyPages(today,oldestDay) };
 }});
 const pages = history.data?.pages || 1;
 useEffect(() => { if(history.data && page>=history.data.pages) setPage(history.data.pages-1); }, [history.data,page]);
 return <section aria-label="Histórico diário Demo">
  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
   <h4 className="flex items-center gap-2 text-xs font-medium"><History className="h-4 w-4 text-muted-foreground"/>Histórico diário · Demo</h4>
   <div className="flex items-center gap-2">
    <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Dias mais recentes" title="Dias mais recentes" disabled={page===0 || history.isLoading} onClick={()=>setPage(p=>Math.max(0,p-1))}><ChevronLeft className="h-4 w-4"/></Button>
    <span className="text-xs font-mono text-muted-foreground">{page+1}/{pages}</span>
    <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Dias mais antigos" title="Dias mais antigos" disabled={page>=pages-1 || history.isLoading} onClick={()=>setPage(p=>p+1)}><ChevronRight className="h-4 w-4"/></Button>
   </div>
  </div>
  {history.isLoading ? <p className="py-3 text-xs text-muted-foreground">Carregando histórico diário…</p> : history.isError ? <p role="alert" className="text-xs text-destructive">Não foi possível carregar o histórico diário.</p> : <div className="divide-y divide-border">
    {history.data?.days.map(day => <div key={day.date} className="flex flex-nowrap items-center gap-1.5 overflow-x-auto py-2.5 text-xs first:pt-0" aria-label={`Resultado Demo ${day.date}`}>
     <h5 className="flex shrink-0 items-center gap-1.5 whitespace-nowrap font-semibold"><Calendar className="h-3.5 w-3.5 text-muted-foreground"/>{new Date(`${day.date}T12:00:00-03:00`).toLocaleDateString('pt-BR',{timeZone:'America/Sao_Paulo'})}{day.date===today && <span className="font-normal text-muted-foreground">· Hoje</span>}</h5>
     <span className="shrink-0 whitespace-nowrap text-[11px] text-muted-foreground" title="Taxa de acerto">{day.accuracy.toLocaleString('pt-BR',{maximumFractionDigits:1})}% acerto</span>
     <span className="flex shrink-0 items-center gap-1 whitespace-nowrap font-mono text-[11px] text-call" title={`Ganhos: ${currency(day.grossWins)}`}><TrendingUp className="h-3 w-3"/>{day.wins} · {shortCurrency(day.grossWins)}</span>
     <span className="flex shrink-0 items-center gap-1 whitespace-nowrap font-mono text-[11px] text-put" title={`Perdas: ${currency(day.grossLosses)}`}><TrendingDown className="h-3 w-3"/>{day.losses} · {shortCurrency(day.grossLosses)}</span>
     <span className="shrink-0 whitespace-nowrap font-mono text-[11px]" title="Operações">{day.wins+day.losses+day.ties+day.pending} op</span>
     <span className="shrink-0 whitespace-nowrap font-mono text-[11px]" title="Empates">{day.ties} emp</span>
     {day.pending>0 && <span className="shrink-0 whitespace-nowrap text-[11px] text-muted-foreground" title="Operações ainda abertas">{day.pending} abertas</span>}
     <span className={cn('ml-auto flex shrink-0 items-center gap-1 whitespace-nowrap font-mono text-sm font-bold',day.profit>0?'text-call':day.profit<0?'text-put':'text-muted-foreground')} title="Saldo do dia">{day.profit>=0?<TrendingUp className="h-3.5 w-3.5"/>:<TrendingDown className="h-3.5 w-3.5"/>}{currency(day.profit)}</span>
    </div>)}
  </div>}
 </section>;
}