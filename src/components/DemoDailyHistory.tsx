import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Calendar, History, ChevronLeft, ChevronRight, TrendingUp, TrendingDown } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from './ui/button';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { cn } from '@/lib/utils';
import { demoDayKey, demoDailyWindow, demoDailySummaries, demoDailyPages, type DemoDailyRow } from '@/lib/demo-daily-history';

const currency = (amount: number) => amount.toLocaleString('pt-BR', { style: 'currency', currency: 'USD' });
// Linha compacta: só dia, ganhos/perdas, acerto e saldo; o resto aparece ao passar o mouse.
const signedCurrency = (amount: number) => `${amount > 0 ? '+' : amount < 0 ? '-' : ''}$${Math.abs(amount).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const shortDate = (date: string) => new Date(`${date}T12:00:00-03:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' });
const longDate = (date: string) => new Date(`${date}T12:00:00-03:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Sao_Paulo' });

export function DemoDailyHistory({ strategy }: { strategy?: string } = {}) {
 const [page, setPage] = useState(0);
 const [openDay, setOpenDay] = useState<string | null>(null);
 const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
 const today = demoDayKey(new Date());
 const queryClient = useQueryClient();
 const window = demoDailyWindow(today, page);
 const holdOpen = (date: string) => {
  if (closeTimer.current) clearTimeout(closeTimer.current);
  closeTimer.current = null;
  setOpenDay(date);
 };
 const closeLater = (date: string) => {
  if (closeTimer.current) clearTimeout(closeTimer.current);
  closeTimer.current = setTimeout(() => setOpenDay(current => (current === date ? null : current)), 180);
 };
 useEffect(() => () => { if (closeTimer.current) clearTimeout(closeTimer.current); }, []);
 useEffect(() => {
  const channel = supabase.channel(`demo-daily-history-live-${strategy ?? 'all'}`).on('postgres_changes', {event:'*',schema:'public',table:'iq_demo_test_orders'}, () => {
    void queryClient.invalidateQueries({queryKey:['demo-daily-history']});
  }).subscribe();
  return () => { void supabase.removeChannel(channel); };
 }, [queryClient]);
 const history = useQuery({ queryKey:['demo-daily-history',today,page,strategy], refetchInterval:10000, queryFn:async () => {
  const oldestQuery = supabase.from('iq_demo_test_orders').select('entry_minute').in('account_type',['PRACTICE','REAL']).or(strategy?`entry_strategy.eq.${strategy}`:'id.not.is.null').eq('status','confirmed').not('iq_option_id','is',null).order('entry_minute').limit(1);
  const rowsQuery = async () => {
   const rows: DemoDailyRow[] = [];
   for(let from=0; ; from+=1000) {
    const {data,error} = await supabase.from('iq_demo_test_orders').select('entry_minute,account_type,status,result,profit,iq_option_id').in('account_type',['PRACTICE','REAL']).or(strategy?`entry_strategy.eq.${strategy}`:'id.not.is.null').eq('status','confirmed').not('iq_option_id','is',null).gte('entry_minute',window.from).lt('entry_minute',window.to).order('entry_minute',{ascending:false}).order('id').range(from,from+999);
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
   {history.data?.days.map(day => {
    const open = openDay === day.date;
    const profitColor = day.profit > 0 ? 'text-call' : day.profit < 0 ? 'text-put' : 'text-muted-foreground';
    return <div key={day.date} className="py-1 first:pt-0">
     <Popover open={open} onOpenChange={value => (value ? holdOpen(day.date) : setOpenDay(current => (current === day.date ? null : current)))}>
      <PopoverTrigger asChild>
       <button type="button" className="flex w-full flex-nowrap items-center gap-1.5 overflow-x-auto rounded-md px-1.5 py-1.5 text-left text-xs outline-none hover:bg-muted/70 focus-visible:ring-1 focus-visible:ring-ring sm:gap-2 sm:text-[13px]" onPointerEnter={event => { if (event.pointerType !== 'touch') holdOpen(day.date); }} onPointerLeave={event => { if (event.pointerType !== 'touch') closeLater(day.date); }} aria-label={`Resultado Demo ${longDate(day.date)}: ${day.wins} ganhos, ${day.losses} perdas, ${day.ties} empates, saldo ${currency(day.profit)}`}>
        <span className="flex shrink-0 items-center gap-1.5 whitespace-nowrap font-semibold"><Calendar className="h-3.5 w-3.5 text-muted-foreground"/>{shortDate(day.date)}</span>
        {day.date === today && <span className="shrink-0 whitespace-nowrap rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium text-primary">Hoje</span>}
        <span className="flex shrink-0 items-center gap-0.5 whitespace-nowrap font-mono"><span className="text-call">{day.wins}W</span><span className="text-muted-foreground">/</span><span className="text-put">{day.losses}L</span></span>
        <span className="shrink-0 whitespace-nowrap font-mono text-[11px] text-muted-foreground">({Math.round(day.accuracy)}%)</span>
        {day.pending > 0 && <span className="shrink-0 whitespace-nowrap rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{day.pending} abertas</span>}
        <span className={cn('ml-auto flex shrink-0 items-center gap-1 whitespace-nowrap font-mono text-sm font-bold', profitColor)}>{day.profit > 0 ? <TrendingUp className="h-3.5 w-3.5"/> : day.profit < 0 ? <TrendingDown className="h-3.5 w-3.5"/> : null}{signedCurrency(day.profit)}</span>
       </button>
      </PopoverTrigger>
      <PopoverContent side="top" align="end" sideOffset={6} className="w-auto min-w-[210px] p-3 text-xs" onPointerEnter={() => holdOpen(day.date)} onPointerLeave={() => closeLater(day.date)}>
       <p className="mb-2 font-semibold whitespace-nowrap">{longDate(day.date)}{day.date === today ? ' · Hoje' : ''}</p>
       <dl className="grid grid-cols-[auto_auto] gap-x-4 gap-y-1 font-mono">
        <dt className="whitespace-nowrap text-muted-foreground">Ganhos</dt>
        <dd className="text-right whitespace-nowrap text-call">{day.wins} · {currency(day.grossWins)}</dd>
        <dt className="whitespace-nowrap text-muted-foreground">Perdas (prejuízo)</dt>
        <dd className="text-right whitespace-nowrap text-put">{day.losses} · {currency(day.grossLosses)}</dd>
        <dt className="whitespace-nowrap text-muted-foreground">Empates</dt>
        <dd className="text-right whitespace-nowrap">{day.ties}</dd>
        {day.pending > 0 && <><dt className="whitespace-nowrap text-muted-foreground">Ainda abertas</dt><dd className="text-right whitespace-nowrap">{day.pending}</dd></>}
        <dt className="whitespace-nowrap text-muted-foreground">Acerto</dt>
        <dd className="text-right whitespace-nowrap">{day.accuracy.toLocaleString('pt-BR',{maximumFractionDigits:1})}%</dd>
        <dt className="whitespace-nowrap font-semibold">Saldo do dia</dt>
        <dd className={cn('text-right whitespace-nowrap font-bold', profitColor)}>{currency(day.profit)}</dd>
       </dl>
      </PopoverContent>
     </Popover>
    </div>;
   })}
  </div>}
 </section>;
}
