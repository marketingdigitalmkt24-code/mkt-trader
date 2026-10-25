import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BarChart3, RefreshCw } from 'lucide-react';
import { CartesianGrid, Line, LineChart, ReferenceLine, XAxis, YAxis } from 'recharts';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { filterScoreHistory, readDemoScoreHistory, scoreHistory } from '@/lib/demo-score-history';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from './ui/chart';
import { DemoScoreOperations } from './DemoScoreOperations';
import { DemoRejectedOperations } from './DemoRejectedOperations';
import { demoStrategyNames } from './DemoTestOperations';

const money = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'USD' });
const percent = (value: number) => `${value.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;
const scoreLabel = (value: string) => value === 'unscored' ? 'Sem nota registrada' : value.replace('.', ',');
const brtTime = (value: number) => new Date(value).toLocaleString('pt-BR', {timeZone:'America/Sao_Paulo',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
const chartConfig = {
 profit: { label: 'Saldo acumulado', color: 'hsl(var(--call))' },
 accuracy: { label: 'Taxa de acerto', color: 'hsl(var(--accent))' },
};

export function DemoScoreHistory() {
 const { user } = useAuth();
 const [period, setPeriod] = useState('all');
 const [score, setScore] = useState('all');
 const [strategy, setStrategy] = useState('all');
 const [sort, setSort] = useState('profit');
 const [page, setPage] = useState(0);
 const query = useQuery({
  queryKey: ['demo-score-history', user?.id], enabled: !!user,
  refetchInterval: 30000,
  queryFn: () => readDemoScoreHistory(async (from, to) => {
   const {data,error} = await supabase.from('iq_demo_test_orders')
    .select('id,signal_id,entry_strategy,entry_minute,settled_at,status,result,profit,iq_option_id')
    .eq('status','confirmed').eq('account_type','PRACTICE').not('iq_option_id','is',null)
    .order('entry_minute',{ascending:true}).order('id').range(from,to);
   if (error) throw error;
   return data ?? [];
  }, async ids => {
   const {data,error} = await supabase.from('iq_demo_test_candidates').select('signal_id,score').in('signal_id',ids);
   if (error) throw error;
   return data ?? [];
  }),
 });
 const base = useMemo(() => (query.data ?? []).filter(r => strategy === 'all' || r.entry_strategy === strategy),[query.data,strategy]);
 const strategies = useMemo(() => [...new Set((query.data ?? []).map(r => r.entry_strategy).filter((v): v is string => !!v))].sort(),[query.data]);
 const rows = useMemo(() => filterScoreHistory(base,period,score),[base,period,score]);
 const history = useMemo(() => scoreHistory(rows),[rows]);
 const options = useMemo(() => scoreHistory(filterScoreHistory(base,period,'all')).byScore
  .sort((a,b) => a.score === 'unscored' ? 1 : b.score === 'unscored' ? -1 : Number(a.score)-Number(b.score)),[base,period]);
 const sorted = useMemo(() => [...history.byScore].sort((a,b) => {
  if (sort === 'accuracy') return b.accuracy-a.accuracy || b.wins+b.losses-a.wins-a.losses;
  if (sort === 'count') return b.orders-a.orders;
  if (sort === 'score') return a.score === 'unscored' ? 1 : b.score === 'unscored' ? -1 : Number(a.score)-Number(b.score);
  return b.profit-a.profit || b.orders-a.orders;
 }),[history.byScore,sort]);
 const pageCount = Math.max(1, Math.ceil(sorted.length / 20));
 const currentPage = Math.min(page,pageCount-1);
 return <section aria-label="Histórico por nota" className="space-y-6">
  <div className="flex flex-wrap items-start justify-between gap-3">
   <div><h2 className="flex items-center gap-2 text-lg font-semibold"><BarChart3 className="h-5 w-5 text-primary"/>Histórico por nota</h2>
    <div className="mt-1 flex flex-wrap items-center gap-2"><Badge variant="outline">DEMO · IQ Option</Badge><span className="text-xs text-muted-foreground">{history.count} ordens confirmadas · Brasília</span></div>
   </div>
   <Button variant="outline" size="sm" onClick={() => query.refetch()} disabled={query.isFetching} className="gap-2"><RefreshCw className={`h-4 w-4 ${query.isFetching?'animate-spin':''}`}/>Atualizar</Button>
  </div>
  <div className="flex flex-wrap gap-3">
   <div className="space-y-1"><label className="text-xs text-muted-foreground" htmlFor="score-history-period">Período</label><Select value={period} onValueChange={v=>{setPeriod(v);setScore('all');setPage(0);}}><SelectTrigger id="score-history-period" className="w-44"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="all">Todo o histórico</SelectItem><SelectItem value="today">Hoje · Brasília</SelectItem><SelectItem value="7d">Últimos 7 dias</SelectItem></SelectContent></Select></div>
   <div className="space-y-1"><label className="text-xs text-muted-foreground" htmlFor="score-history-score">Nota</label><Select value={score} onValueChange={v=>{setScore(v);setPage(0);}}><SelectTrigger id="score-history-score" className="w-48"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="all">Todas as notas</SelectItem>{options.map(row=><SelectItem key={row.score} value={row.score}>{scoreLabel(row.score)}</SelectItem>)}</SelectContent></Select></div>
   <div className="space-y-1"><label className="text-xs text-muted-foreground" htmlFor="score-history-strategy">Estratégia</label><Select value={strategy} onValueChange={v=>{setStrategy(v);setScore('all');setPage(0);}}><SelectTrigger id="score-history-strategy" className="w-52"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="all">Todas as estratégias</SelectItem>{strategies.map(s=><SelectItem key={s} value={s}>{demoStrategyNames[s] ?? s}</SelectItem>)}</SelectContent></Select></div>
   <div className="space-y-1"><label className="text-xs text-muted-foreground" htmlFor="score-history-sort">Ordenar por</label><Select value={sort} onValueChange={v=>{setSort(v);setPage(0);}}><SelectTrigger id="score-history-sort" className="w-44"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="profit">Maior saldo</SelectItem><SelectItem value="accuracy">Maior acerto</SelectItem><SelectItem value="count">Mais operações</SelectItem><SelectItem value="score">Nota crescente</SelectItem></SelectContent></Select></div>
  </div>
  {query.isPending ? <p role="status" className="py-10 text-sm text-muted-foreground">Carregando histórico por nota…</p> : query.isError ? <p role="alert" className="py-6 text-sm text-destructive">Não foi possível atualizar o histórico por nota. Tente novamente.</p> : <>
   <div className="grid grid-cols-2 gap-4 border-y border-border py-4 sm:grid-cols-4">
    <div><p className="text-xs text-muted-foreground">Saldo acumulado</p><p className={`mt-1 font-mono text-xl font-semibold ${history.totals.profit<0?'text-put':'text-call'}`}>{money(history.totals.profit)}</p></div>
    <div><p className="text-xs text-muted-foreground">Taxa de acerto · WIN / (WIN + LOSS)</p><p className="mt-1 font-mono text-xl font-semibold">{percent(history.totals.accuracy)}</p></div>
    <div><p className="text-xs text-muted-foreground">Ganhos / perdas</p><p className="mt-1 font-mono text-xl font-semibold"><span className="text-call">{history.totals.wins}</span> / <span className="text-put">{history.totals.losses}</span></p></div>
    <div><p className="text-xs text-muted-foreground">Empates / abertas</p><p className="mt-1 font-mono text-xl font-semibold">{history.totals.ties} / {history.totals.pending}</p></div>
   </div>
   {!history.count ? <p className="py-10 text-sm text-muted-foreground">Nenhuma ordem Demo confirmada neste período e nota.</p> : <>
    <div className="grid min-w-0 gap-6 lg:grid-cols-2">
     <div className="min-w-0"><h3 className="mb-3 text-sm font-medium">Evolução do saldo · liquidações</h3>{history.timeline.length ? <ChartContainer config={chartConfig} className="h-64 w-full aspect-auto" aria-label="Gráfico do saldo acumulado"><LineChart data={history.timeline} margin={{left:0,right:12,top:8,bottom:8}}><CartesianGrid vertical={false}/><XAxis dataKey="at" tickFormatter={brtTime} minTickGap={60}/><YAxis width={62} tickFormatter={v=>`$${v}`} /><ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3"/><ChartTooltip content={<ChartTooltipContent labelFormatter={(_,payload)=>brtTime(Number(payload[0]?.payload.at))} formatter={value=><span className="font-mono">{money(Number(value))}</span>}/>}/><Line type="linear" dataKey="profit" stroke="var(--color-profit)" strokeWidth={2} dot={history.timeline.length===1} isAnimationActive={false}/></LineChart></ChartContainer> : <p className="py-16 text-sm text-muted-foreground">Aguardando resultados confirmados.</p>}</div>
     <div className="min-w-0"><h3 className="mb-3 text-sm font-medium">Evolução da taxa de acerto</h3>{history.timeline.length ? <ChartContainer config={chartConfig} className="h-64 w-full aspect-auto" aria-label="Gráfico da taxa de acerto"><LineChart data={history.timeline} margin={{left:0,right:12,top:8,bottom:8}}><CartesianGrid vertical={false}/><XAxis dataKey="at" tickFormatter={brtTime} minTickGap={60}/><YAxis width={48} domain={[0,100]} tickFormatter={v=>`${v}%`}/><ChartTooltip content={<ChartTooltipContent labelFormatter={(_,payload)=>brtTime(Number(payload[0]?.payload.at))} formatter={value=><span className="font-mono">{percent(Number(value))}</span>}/>}/><Line type="linear" dataKey="accuracy" stroke="var(--color-accuracy)" strokeWidth={2} dot={history.timeline.length===1} isAnimationActive={false}/></LineChart></ChartContainer> : <p className="py-16 text-sm text-muted-foreground">Aguardando resultados confirmados.</p>}</div>
    </div>
    <div><h3 className="mb-3 text-sm font-medium">Resultados por nota</h3><div className="overflow-x-auto"><table className="w-full text-left text-xs sm:text-sm"><thead className="border-y border-border text-muted-foreground"><tr>{['Nota','Ordens','WIN','LOSS','Empates','Abertas','Acerto','Saldo'].map(label=><th key={label} className="whitespace-nowrap px-3 py-3 font-medium first:pl-0">{label}</th>)}</tr></thead><tbody>{sorted.slice(currentPage*20,currentPage*20+20).map(row=><tr key={row.score} className="border-b border-border/60"><td className="whitespace-nowrap py-3 pr-3 font-mono font-semibold">{scoreLabel(row.score)}</td><td className="px-3 py-3 font-mono">{row.orders}</td><td className="px-3 py-3 font-mono text-call">{row.wins}</td><td className="px-3 py-3 font-mono text-put">{row.losses}</td><td className="px-3 py-3 font-mono">{row.ties}</td><td className="px-3 py-3 font-mono">{row.pending}</td><td className="whitespace-nowrap px-3 py-3 font-mono">{row.wins+row.losses ? percent(row.accuracy):'—'}</td><td className={`whitespace-nowrap px-3 py-3 font-mono ${row.profit<0?'text-put':'text-call'}`}>{money(row.profit)}</td></tr>)}</tbody></table></div>
    {pageCount>1 && <div className="mt-3 flex items-center justify-between"><Button variant="outline" size="sm" disabled={currentPage===0} onClick={()=>setPage(currentPage-1)}>Anterior</Button><span className="text-xs text-muted-foreground">{currentPage+1} / {pageCount}</span><Button variant="outline" size="sm" disabled={currentPage+1>=pageCount} onClick={()=>setPage(currentPage+1)}>Próxima</Button></div>}</div>
    {(strategy !== 'all' || (score !== 'all' && score !== 'unscored')) && <DemoScoreOperations key={`${period}-${score}-${strategy}`} score={score} strategy={strategy} ids={[...rows].sort((a,b)=>Date.parse(b.entry_minute)-Date.parse(a.entry_minute)||b.id.localeCompare(a.id)).map(row=>row.id)}/>}
   </>}
   <p className="text-xs text-muted-foreground">Atualizado às {new Date(query.dataUpdatedAt).toLocaleTimeString('pt-BR',{timeZone:'America/Sao_Paulo'})} · Resultado financeiro Demo, não saldo da conta principal.</p>
  </>}
  <DemoRejectedOperations key={`${period}-${score}`} period={period} score={score}/>
 </section>;
}