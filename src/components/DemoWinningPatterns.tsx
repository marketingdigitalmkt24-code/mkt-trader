import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { preEntryCandles, type PatternCandle } from '@/lib/demo-winning-patterns';
import { MiniChart, demoStrategyNames } from './DemoTestOperations';
import { DemoPatternChart } from './DemoPatternChart';
import { Button } from './ui/button';
import { HoverCard, HoverCardContent, HoverCardTrigger } from './ui/hover-card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';

const PAGE = 10;
const time = (value: string) => new Date(value).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const money = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'USD' });
type Operation = { id: string; signal_id: string; asset: string; direction: string; entry_strategy: string; entry_minute: string; result: string; amount: number | null; profit: number | null; rejected: boolean; score?: number | null; testResult?: string; candles?: PatternCandle[] | null };
function chartCandles(value: unknown): PatternCandle[] | null {
 if (!Array.isArray(value)) return null;
 const valid = value.filter((c): c is PatternCandle => c != null && typeof c === 'object' && ['t','o','c','h','l'].every(key => typeof c[key] === 'number' && Number.isFinite(c[key])));
 return valid.length ? valid : null;
}

export function DemoWinningPatterns() {
 const { user } = useAuth();
 const queryClient = useQueryClient();
 const [filter, setFilter] = useState('all');
 const [page, setPage] = useState(0);
 useEffect(() => {
  if (!user) return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const refresh = () => {
   if (timer) clearTimeout(timer);
   timer = setTimeout(() => { void queryClient.invalidateQueries({ queryKey: ['demo-winning-patterns', user.id] }); }, 300);
  };
  const channel = supabase.channel(`demo-winning-patterns-${user.id}`)
   .on('postgres_changes', { event: '*', schema: 'public', table: 'iq_demo_test_orders' }, refresh)
   .on('postgres_changes', { event: '*', schema: 'public', table: 'iq_demo_test_candidates' }, refresh)
   .on('postgres_changes', { event: '*', schema: 'public', table: 'demo_selection_rejections' }, refresh)
   .subscribe();
  return () => { if (timer) clearTimeout(timer); void supabase.removeChannel(channel); };
 }, [user?.id, queryClient]);
 const query = useQuery({
  queryKey: ['demo-winning-patterns', user?.id, filter, page], enabled: !!user,
  refetchInterval: 10000, refetchIntervalInBackground: true, refetchOnWindowFocus: 'always',
  queryFn: async () => {
   // Merge independently paginated ledgers; rejected candidates never acquire a broker outcome.
   const limit = (page + 1) * PAGE;
   const [orders, rejections] = await Promise.all([
    (async () => {
     if (filter === 'rejected') return { rows: [] as Operation[], count: 0 };
     const rows: Operation[] = []; let count = 0;
     for (let from = 0; from < limit; from += 1000) {
      let request = supabase.from('iq_demo_test_orders')
       .select('id,signal_id,asset,direction,entry_strategy,entry_minute,amount,result,profit', { count: 'exact' })
       .eq('status', 'confirmed').eq('account_type', 'PRACTICE').not('iq_option_id', 'is', null);
      if (filter === 'win' || filter === 'loss') request = request.eq('result', filter);
      const { data, error, count: total } = await request.order('entry_minute', { ascending: false }).order('id', { ascending: false }).range(from, Math.min(from + 999, limit - 1));
      if (error) throw error;
      count = total ?? 0;
      rows.push(...(data ?? []).map(row => ({ ...row, rejected: false })));
      if (!data?.length || rows.length >= count) break;
     }
     return { rows, count };
    })(),
    (async () => {
     if (filter !== 'all' && filter !== 'rejected') return { rows: [] as Operation[], count: 0 };
     const rows: Operation[] = []; let count = 0;
     for (let from = 0; from < limit; from += 1000) {
      const { data, error, count: total } = await supabase.from('demo_selection_rejections')
       .select('id,signal_id,asset,direction,entry_strategy,entry_minute,score', { count: 'exact' })
       .order('entry_minute', { ascending: false }).order('id', { ascending: false }).range(from, Math.min(from + 999, limit - 1));
      if (error) throw error;
      count = total ?? 0;
      rows.push(...(data ?? []).map(row => ({ ...row, rejected: true, result: 'rejected', amount: null, profit: null })));
      if (!data?.length || rows.length >= count) break;
     }
     return { rows, count };
    })(),
   ]);
   const rows = [...orders.rows, ...rejections.rows].sort((a, b) => Date.parse(b.entry_minute) - Date.parse(a.entry_minute) || b.id.localeCompare(a.id)).slice(page * PAGE, limit);
   const executed = rows.filter(row => !row.rejected).map(row => row.signal_id);
   const rejected = rows.filter(row => row.rejected).map(row => row.id);
   const rejectedSignals = rows.filter(row => row.rejected).map(row => row.signal_id);
   const [charts, rejectedCharts, testResults] = await Promise.all([
    executed.length ? supabase.from('iq_demo_test_candidates').select('signal_id,candles').in('signal_id', executed) : Promise.resolve({ data: [], error: null }),
    rejected.length ? supabase.from('demo_selection_rejections').select('id,candles').in('id', rejected) : Promise.resolve({ data: [], error: null }),
    rejectedSignals.length ? supabase.from('operation_results').select('signal_id,result').eq('timeframe', 'TEST').in('signal_id', rejectedSignals) : Promise.resolve({ data: [], error: null }),
   ]);
   if (charts.error) throw charts.error;
   if (rejectedCharts.error) throw rejectedCharts.error;
   if (testResults.error) throw testResults.error;
   const snapshots = new Map((charts.data ?? []).map(row => [row.signal_id, chartCandles(row.candles)]));
   const rejectionSnapshots = new Map((rejectedCharts.data ?? []).map(row => [row.id, chartCandles(row.candles)]));
   const testOutcome = new Map((testResults.data ?? []).map(row => [row.signal_id, String(row.result).toLowerCase()]));
   return { count: orders.count + rejections.count, rows: rows.map(row => ({ ...row, testResult: row.rejected ? testOutcome.get(row.signal_id) : undefined, candles: row.rejected ? rejectionSnapshots.get(row.id) : snapshots.get(row.signal_id) })) };
  },
 });
 const pages = Math.max(1, Math.ceil((query.data?.count ?? 0) / PAGE));
 return <section aria-label="Padrões vencedores" className="space-y-5">
  <div className="flex flex-wrap items-center justify-between gap-3">
   <h2 className="text-lg font-semibold">Padrões vencedores</h2>
   <Button variant="outline" size="sm" disabled={query.isFetching} onClick={() => query.refetch()} className="gap-2"><RefreshCw className={`h-4 w-4 ${query.isFetching ? 'animate-spin' : ''}`} />Atualizar</Button>
  </div>
  <div className="flex flex-wrap items-center justify-between gap-3">
   <Select value={filter} onValueChange={value => { setFilter(value); setPage(0); }}><SelectTrigger className="w-52" aria-label="Filtrar operações"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todas as operações</SelectItem><SelectItem value="win">Ganhos</SelectItem><SelectItem value="loss">Perdas</SelectItem><SelectItem value="rejected">Rejeitadas</SelectItem></SelectContent></Select>
   <span className="text-xs text-muted-foreground">{query.data?.count ?? 0} operações · Brasília</span>
  </div>
  {query.isError && <p role="alert" className="text-sm text-destructive">Não foi possível atualizar as operações.{query.data ? ' Os últimos dados permanecem visíveis.' : ''}</p>}
  {query.isPending ? <p role="status" className="text-sm text-muted-foreground">Carregando operações…</p> : query.data && (!query.data.rows.length ? <p className="text-sm text-muted-foreground">Nenhuma operação neste filtro.</p> : <div className="space-y-1" aria-label="Lista de operações">{query.data.rows.map(row => <HoverCard key={`${row.rejected ? 'rejected' : 'order'}-${row.id}`} openDelay={150}><HoverCardTrigger asChild><div tabIndex={0} className="flex cursor-default flex-wrap items-center gap-2 rounded-md bg-secondary/30 p-2 text-xs hover:bg-secondary/60">
   <span className="font-mono text-muted-foreground">{time(row.entry_minute)}</span>
   <span className="font-medium">{row.asset}</span>
   <span className={row.direction === 'CALL' ? 'text-call' : 'text-put'}>{row.direction}</span>
   <span className="text-muted-foreground">{demoStrategyNames[row.entry_strategy] ?? row.entry_strategy}</span>
   {row.rejected && <span className="font-mono text-muted-foreground">{row.score != null && Number.isFinite(row.score) ? `Nota ${row.score.toFixed(2).replace('.', ',')}` : 'Sem nota registrada'}</span>}
   {row.amount != null && <span className="font-mono text-[10px] text-muted-foreground">{money(Number(row.amount))}</span>}
   <span className={`ml-auto font-mono ${(row.rejected ? row.testResult : row.result) === 'win' ? 'text-call' : (row.rejected ? row.testResult : row.result) === 'loss' ? 'text-put' : 'text-muted-foreground'}`}>{row.rejected ? (row.testResult === 'win' || row.testResult === 'loss' || row.testResult === 'tie' ? `REJEITADA · ${row.testResult === 'tie' ? 'EMPATE' : row.testResult.toUpperCase()} (teste)` : 'REJEITADA · sem resultado') : row.result === 'pending' ? 'ABERTA' : `${row.result.toUpperCase()} · ${money(Number(row.profit))}`}</span>
  </div></HoverCardTrigger><HoverCardContent className="w-80 max-w-[calc(100vw-2rem)]"><p className="mb-2 text-xs font-medium">{row.asset} · {demoStrategyNames[row.entry_strategy] ?? row.entry_strategy}</p>
   {row.rejected ? <DemoPatternChart candles={preEntryCandles(row.candles, row.entry_minute)} direction={row.direction} /> : <MiniChart candles={row.candles} direction={row.direction} entry={Date.parse(row.entry_minute) / 1000} />}
   <p className="mt-2 border-t border-border pt-2 text-xs text-muted-foreground">{time(row.entry_minute)} · {row.rejected ? 'REJEITADA · Não enviada à IQ Option' : row.result === 'pending' ? 'ABERTA' : row.result.toUpperCase()}</p>
  </HoverCardContent></HoverCard>)}</div>)}
  {query.data && pages > 1 && <div className="flex items-center justify-between gap-2"><Button variant="outline" size="sm" disabled={page === 0 || query.isFetching} onClick={() => setPage(value => value - 1)}>Anterior</Button><span className="text-xs text-muted-foreground">{page + 1} / {pages}</span><Button variant="outline" size="sm" disabled={page + 1 >= pages || query.isFetching} onClick={() => setPage(value => value + 1)}>Próxima</Button></div>}
  <p className="text-xs text-muted-foreground" aria-live="polite">{query.dataUpdatedAt ? `Atualizado às ${new Date(query.dataUpdatedAt).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo' })}` : 'Aguardando atualização'}{query.isFetching ? ' · Atualizando…' : ''}</p>
 </section>;
}
