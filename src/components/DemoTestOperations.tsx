import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { HoverCard, HoverCardContent, HoverCardTrigger } from './ui/hover-card';
import { allDemoOutcomes, demoTestStats } from '@/lib/demo-test-stats';
import { demoChartComparison } from '@/lib/demo-chart-comparison';

export const demoStrategyNames: Record<string, string> = {
 TENDENCIA_ALINHADA: 'Tendência alinhada', QUEDA_FORTE: 'Queda forte', TENDENCIA: 'Tendência', VELA_FORCA: 'Vela de força', REVERSAO_RSI: 'Reversão RSI',
 CONTINUACAO_QUEDA_V1: 'Queda', TETO_V1: 'Teto', QUEDA_WIN_CALL_V1: 'Queda win',
 QUEDA_WIN_RETRY_V1: 'Queda win +1', FORCA_PADRAO_V1: 'Força padrão', FORCA_ANTECIPADA_V1: 'Força antecipada',
 TENDENCIA_WIN_INVERTIDA: 'Tendência invertida', ICHIMOKU_FORCA: 'Ichimoku + Vela de Força',
 KDJ_RSI: 'KDJ + Reversão RSI', TREND_WIN_LOSS_FORCE_LOSS: 'Retomada',
 TAKASHI_BNF_V1: 'Takashi Kotegawa', ICHIMOKU: 'Ichimoku', RECUO_EMA21: 'Recuo na média 21',
 ICHIMOKU_RECUO21: 'Ichimoku + Recuo 21',
 TENDENCIA_FORCA_RECUO: 'Tendência + Força + Recuo',
 CONFLUENCIA_4_ESTRATEGIAS: 'Confluência das 4 estratégias', PADRAO_VENCEDOR: 'Padrão vencedor',
 ROMPIMENTO: 'Rompimento', KDJ: 'KDJ',
};

export function DemoTestOperations() {
 const [page,setPage]=useState(0);
 const queryClient=useQueryClient();
 useEffect(()=>{
  const channel=supabase.channel('demo-operations-live-totals').on('postgres_changes',{
   event:'*',schema:'public',table:'iq_demo_test_orders',
  },()=>{
   void queryClient.invalidateQueries({queryKey:['demo-test-orders']});
   void queryClient.invalidateQueries({queryKey:['demo-test-totals']});
  }).subscribe();
  return ()=>{void supabase.removeChannel(channel);};
 },[queryClient]);
 // Version the cached shape: mounted sessions may still hold totals without gross fields.
 const stats = useQuery({queryKey:['demo-test-totals','gross-v2'],refetchInterval:10000,queryFn:async()=>demoTestStats(await allDemoOutcomes(async(from,to)=>{
  const {data,error}=await supabase.from('iq_demo_test_orders').select('status,result,profit,iq_option_id').eq('status','confirmed').order('created_at',{ascending:false}).order('id').range(from,to);
  if(error)throw error;return data || [];
 }))});
 const {data,isLoading,isError}=useQuery({queryKey:['demo-test-orders',page],refetchInterval:10000,queryFn:async()=>{
 const {data,count,error}=await supabase.from('iq_demo_test_orders').select('*',{count:'exact'}).eq('status','confirmed').not('iq_option_id','is',null).order('created_at',{ascending:false}).range(page*10,page*10+9);
 if(error)throw error;
 const ids=(data||[]).map(r=>r.signal_id);
 const {data:cand}=ids.length?await supabase.from('iq_demo_test_candidates').select('signal_id,candles,pattern_match').in('signal_id',ids):{data:[]};
 const charts=new Map((cand||[]).map(c=>[c.signal_id,c.candles as Candle[]|null]));
 const patterns=new Map((cand||[]).filter(c=>c.pattern_match!=null).map(c=>[c.signal_id,c.pattern_match]));
 return {rows:data || [],count:count || 0,charts,patterns};
 }});
 return <section className="mb-4 border-b border-border pb-4" aria-label="Últimas operações Demo">
 <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><h4 className="text-xs font-medium">Últimas operações · Demo</h4><Badge variant="outline">DEMO · TESTE</Badge></div>
 {stats.isLoading?<p className="mb-3 text-xs text-muted-foreground">Carregando resultado acumulado…</p>:stats.isError?<p role="alert" className="mb-3 text-xs text-destructive">Não foi possível carregar o resultado acumulado.</p>:stats.data && <div className="mb-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-4" aria-label="Resultado acumulado Demo">
  <div><span className="block text-muted-foreground">Ganhos</span><strong className="font-mono text-call">{stats.data.wins}</strong><span className="block font-mono text-call">{stats.data.grossWins?.toLocaleString('pt-BR',{style:'currency',currency:'USD'}) ?? '—'}</span></div>
  <div><span className="block text-muted-foreground">Perdas</span><strong className="font-mono text-put">{stats.data.losses}</strong><span className="block font-mono text-put">{stats.data.grossLosses?.toLocaleString('pt-BR',{style:'currency',currency:'USD'}) ?? '—'}</span></div>
  <div><span className="block text-muted-foreground">Acerto</span><strong className="font-mono">{stats.data.accuracy.toLocaleString('pt-BR',{maximumFractionDigits:2})}%</strong></div>
  <div><span className="block text-muted-foreground">{stats.data.profit>0?'Saldo positivo':stats.data.profit<0?'Saldo negativo':'Saldo zerado'}</span><strong className={`font-mono ${stats.data.profit>0?'text-call':stats.data.profit<0?'text-put':'text-muted-foreground'}`}>{stats.data.profit.toLocaleString('pt-BR',{style:'currency',currency:'USD'})}</strong></div>
  <span className="col-span-2 text-muted-foreground sm:col-span-4">Acumulado · {stats.data.pending} abertas · {stats.data.ties} empates</span>
 </div>}
 {isLoading?<p className="text-xs text-muted-foreground">Carregando ordens Demo…</p>:isError?<p role="alert" className="text-xs text-destructive">Não foi possível carregar as ordens Demo.</p>:!data?.rows.length?<p className="text-xs text-muted-foreground">Aguardando primeira ordem Demo confirmada.</p>:<div className="space-y-1">{data.rows.map(row=><HoverCard key={row.id} openDelay={150}><HoverCardTrigger asChild><div tabIndex={0} className="flex cursor-default flex-col gap-1 rounded-md bg-secondary/30 p-2 text-xs hover:bg-secondary/60">
 <div className="flex min-w-0 items-center gap-2">
 <span className="shrink-0 whitespace-nowrap font-mono text-muted-foreground">{new Date(row.entry_minute).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}</span>
 <span className="min-w-0 truncate font-medium" title={row.asset}>{row.asset}</span>
 <span className={'shrink-0 '+(row.direction==='CALL'?'text-call':'text-put')}>{row.direction}</span>
 <span className="ml-auto shrink-0 whitespace-nowrap font-mono">{row.status==='confirmed'?(row.result==='pending'?'ABERTA':`${row.result.toUpperCase()} · ${Number(row.profit).toLocaleString('pt-BR',{style:'currency',currency:'USD'})}`):row.status==='failed'?'NÃO ENVIADA':row.status==='unknown'?'SEM CONFIRMAÇÃO':'AGUARDANDO'}</span>
 </div>
 <div className="flex min-w-0 flex-wrap items-center gap-2">
 {data.patterns.has(row.signal_id)?<Badge variant="outline" className="text-call" title="Correspondência registrada com o gráfico anterior de uma operação WIN confirmada">{demoStrategyNames[row.entry_strategy]??row.entry_strategy}</Badge>:<span className="text-muted-foreground">{demoStrategyNames[row.entry_strategy]??row.entry_strategy}</span>}
 <span className="text-muted-foreground font-mono text-[10px]">{Number(row.amount).toLocaleString('pt-BR',{style:'currency',currency:'USD'})}</span>
 </div>
  </div></HoverCardTrigger><HoverCardContent className="w-80 max-w-[calc(100vw-2rem)]"><p className="mb-1 text-xs font-medium">{row.asset} · previsão × fechamento</p><MiniChart candles={data.charts.get(row.signal_id)} direction={row.direction} entry={Date.parse(row.entry_minute)/1000}/><p className="mt-2 border-t border-border pt-2 text-xs text-muted-foreground">Entrada: {new Date(row.created_at).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'})}</p><p className="text-xs text-muted-foreground">IQ Option: {row.result==='pending'?'aguardando resultado':row.result.toUpperCase()}</p></HoverCardContent></HoverCard>)}</div>}
 {(data?.count || 0)>10 && <div className="mt-2 flex items-center justify-between"><Button variant="ghost" size="sm" disabled={page===0} onClick={()=>setPage(p=>p-1)}><ChevronLeft className="h-3 w-3"/>Anterior</Button><span className="text-xs text-muted-foreground">{page+1}/{Math.ceil((data?.count || 0)/10)}</span><Button variant="ghost" size="sm" disabled={(page+1)*10>=(data?.count || 0)} onClick={()=>setPage(p=>p+1)}>Próxima<ChevronRight className="h-3 w-3"/></Button></div>}
 </section>;
}

type Candle={t:number;o:number;c:number;h:number;l:number};
export function MiniChart({candles,direction,entry}:{candles?:Candle[]|null;direction:string;entry:number}){
 if(!candles?.length)return <p className="text-xs text-muted-foreground">Gráfico indisponível para esta operação (registrada antes do salvamento das velas).</p>;
   const comparison=demoChartComparison(candles,entry,direction);
   const nextCandle=candles.find(k=>k.t===entry+60 && k.t+60<=Date.now()/1000);
   const W=288,H=140,hi=Math.max(...candles.map(k=>k.h)),lo=Math.min(...candles.map(k=>k.l)),span=hi-lo||1,step=(W-20)/(candles.length+(candles.some(k=>k.t===entry)?0:1)+(nextCandle?0:1));
 const y=(v:number)=>4+(hi-v)/span*(H-8);
  return <><div className="mb-2 flex flex-wrap items-center gap-2 text-xs"><span className={direction==='CALL'?'text-call':'text-put'}>Previsão: {direction==='CALL'?'↑ Alta · CALL':'↓ Queda · PUT'}</span><span className="text-muted-foreground">Fechou: {comparison ? comparison.movement==='up'?'↑ Alta':comparison.movement==='down'?'↓ Queda':'= Empate' : 'aguardando'}</span></div><svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Velas da operação, direção prevista e fechamento real">
  {candles.map((k,i)=>{const x=i*step+step/2,up=k.c>=k.o,cls=up?'fill-call stroke-call':'fill-put stroke-put';return <g key={k.t} className={cls}>
   <line x1={x} x2={x} y1={y(k.h)} y2={y(k.l)} strokeWidth={1}/>
   <rect x={x-step*0.35} width={step*0.7} y={y(Math.max(k.o,k.c))} height={Math.max(1,Math.abs(y(k.o)-y(k.c)))}/></g>;})}
   {(()=>{const i=candles.findIndex(k=>k.t===entry),x=(i<0?candles.length:i)*step;return <g>
   <rect x={x} width={step} y={0} height={H} className="fill-primary/10"/>
   <line x1={x} x2={x} y1={0} y2={H} className="stroke-muted-foreground" strokeDasharray="3 3"/>
    <text x={x+2} y={direction==='CALL'?H-4:12} className={`text-[10px] ${direction==='CALL'?'fill-call':'fill-put'}`}>{direction==='CALL'?'▲':'▼'}</text>
    {comparison && <><line x1={x+step/2} x2={W} y1={y(comparison.candle.c)} y2={y(comparison.candle.c)} className="stroke-foreground" strokeDasharray="2 2"/><circle cx={x+step/2} cy={y(comparison.candle.c)} r={3} className="fill-foreground"/></>}
    </g>;})()}
    {nextCandle && <g><rect x={candles.findIndex(k=>k.t===entry+60)*step} width={step} y={0} height={H} className="fill-accent/20"/><text x={candles.findIndex(k=>k.t===entry+60)*step+step/2} y={H-4} textAnchor="middle" className="fill-foreground text-[10px]">+1</text></g>}
   </svg><p className="mt-2 text-xs text-muted-foreground">Próxima vela: {nextCandle?nextCandle.c>nextCandle.o?'↑ Alta':nextCandle.c<nextCandle.o?'↓ Queda':'= Empate':'aguardando fechamento'}</p><p className={`mt-2 text-xs font-medium ${comparison?.agrees===true?'text-call':comparison?.agrees===false?'text-put':'text-muted-foreground'}`}>{!comparison?'Aguardando fechamento da vela':comparison.agrees===null?'Vela sem variação':comparison.agrees?'Previsão acertou a direção da vela':'Vela fechou contra a previsão'}</p><p className="mt-1 text-[10px] text-muted-foreground">Comparação da abertura ao fechamento da vela; pode diferir do resultado da ordem na IQ Option.</p></>;
}
