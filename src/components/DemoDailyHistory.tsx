import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Calendar, History, ChevronLeft, ChevronRight, TrendingUp, TrendingDown } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from './ui/button';
import { cn } from '@/lib/utils';
import { demoDayKey, demoDailyWindow, demoDailySummaries, demoDailyPages, type DemoDailyRow } from '@/lib/demo-daily-history';

const currency = (amount: number) => amount.toLocaleString('pt-BR', { style: 'currency', currency: 'USD' });

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
   {history.data?.days.map(day => <div key={day.date} className="py-4 first:pt-0" aria-label={`Resultado Demo ${day.date}`}>
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
     <h5 className="flex items-center gap-2 text-xs font-semibold"><Calendar className="h-4 w-4 text-muted-foreground"/>{new Date(`${day.date}T12:00:00-03:00`).toLocaleDateString('pt-BR',{timeZone:'America/Sao_Paulo'})}{day.date===today && <span className="text-muted-foreground">· Hoje</span>}</h5>
     <span className={cn('flex items-center gap-2 font-mono text-xl font-bold',day.profit>0?'text-call':day.profit<0?'text-put':'text-muted-foreground')}>
      {day.profit>=0?<TrendingUp className="h-4 w-4"/>:<TrendingDown className="h-4 w-4"/>}{currency(day.profit)}
     </span>
    </div>
    <div className="mb-3 flex items-center justify-between text-xs"><span className="text-muted-foreground">Taxa de acerto</span><strong className="font-mono">{day.accuracy.toLocaleString('pt-BR',{maximumFractionDigits:1})}%</strong></div>
    <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-4">
     <div><span className="block text-muted-foreground">Ganhos</span><strong className="font-mono text-call">{day.wins}</strong><span className="block font-mono text-call">{currency(day.grossWins)}</span></div>
     <div><span className="block text-muted-foreground">Perdas</span><strong className="font-mono text-put">{day.losses}</strong><span className="block font-mono text-put">{currency(day.grossLosses)}</span></div>
     <div><span className="block text-muted-foreground">Operações</span><strong className="font-mono">{day.wins+day.losses+day.ties+day.pending}</strong></div>
     <div><span className="block text-muted-foreground">Empates</span><strong className="font-mono">{day.ties}</strong></div>
    </div>
    {day.pending>0 && <p className="mt-2 text-xs text-muted-foreground">{day.pending} abertas</p>}
   </div>)}
  </div>}
 </section>;
}