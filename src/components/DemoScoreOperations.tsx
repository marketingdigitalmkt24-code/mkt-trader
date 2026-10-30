import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { MiniChart, demoStrategyNames } from './DemoTestOperations';
import { Button } from './ui/button';
import { HoverCard, HoverCardContent, HoverCardTrigger } from './ui/hover-card';

type Candle = {t:number;o:number;c:number;h:number;l:number};
function candlesFromJson(value: unknown): Candle[] | null {
 if (!Array.isArray(value)) return null;
 const candles = value.filter((c): c is Candle => c != null && typeof c === 'object' &&
  ['t','o','c','h','l'].every(key => typeof c[key] === 'number' && Number.isFinite(c[key])));
 return candles.length ? candles : null;
}
const money = (value:number) => value.toLocaleString('pt-BR',{style:'currency',currency:'USD'});
const PAGE = 10;

export function DemoScoreOperations({ids,score,strategy='all',label}:{ids:string[];score:string;strategy?:string;label?:string}) {
 const [page,setPage] = useState(0);
 const pages = Math.max(1,Math.ceil(ids.length/PAGE));
 const currentPage = Math.min(page,pages-1);
 const pageIds = ids.slice(currentPage*PAGE,currentPage*PAGE+PAGE);
 const query = useQuery({queryKey:['demo-score-operation-charts',pageIds],enabled:pageIds.length>0,refetchInterval:30000,queryFn:async()=>{
  const {data:orders,error} = await supabase.from('iq_demo_test_orders')
   .select('id,signal_id,asset,direction,entry_strategy,amount,result,profit,created_at,entry_minute')
   .eq('status','confirmed').in('account_type',['PRACTICE','REAL']).not('iq_option_id','is',null).in('id',pageIds);
  if(error) throw error;
  const signals=(orders ?? []).map(r=>r.signal_id);
  const {data:charts,error:chartError} = signals.length ? await supabase.from('iq_demo_test_candidates')
   .select('signal_id,candles,score').in('signal_id',signals) : {data:[],error:null};
  if(chartError) throw chartError;
  const snapshots = new Map((charts ?? []).map(c=>[c.signal_id,{candles:candlesFromJson(c.candles),score:c.score==null?null:Number(c.score)}]));
  return (orders ?? []).sort((a,b)=>pageIds.indexOf(a.id)-pageIds.indexOf(b.id)).map(row=>({...row,...(snapshots.get(row.signal_id) ?? {candles:null,score:null})}));
 }});
 const title = label ?? [score !== 'all' && score !== 'unscored' ? `nota ${score.replace('.',',')}` : null, strategy !== 'all' ? (demoStrategyNames[strategy] ?? strategy) : null].filter(Boolean).join(' · ');
 return <section aria-label="Operações filtradas" className="space-y-3 border-t border-border pt-5">
  <h3 className="text-sm font-semibold">Operações · {title} <span className="font-normal text-muted-foreground">({ids.length})</span></h3>
  {!ids.length ? <p className="text-sm text-muted-foreground">Nenhuma operação neste filtro.</p> : query.isPending ? <p role="status" className="text-sm text-muted-foreground">Carregando operações…</p> : query.isError ? <div role="alert" className="flex flex-wrap items-center gap-3"><p className="text-sm text-destructive">Não foi possível carregar as operações.</p><Button variant="outline" size="sm" onClick={()=>query.refetch()}>Tentar novamente</Button></div> : <div className="space-y-1">
   {query.data?.map(row=><HoverCard key={row.id} openDelay={150}><HoverCardTrigger asChild><div tabIndex={0} className="flex cursor-default flex-wrap items-center gap-2 rounded-md bg-secondary/30 p-2 text-xs hover:bg-secondary/60">
    <span className="font-mono text-muted-foreground">{new Date(row.entry_minute).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'})}</span>
    <span className="font-medium">{row.asset}</span>
    <span className="rounded border border-border bg-secondary/60 px-1.5 py-0.5 font-mono font-bold leading-none">nota {row.score==null||Number.isNaN(row.score)?'—':row.score.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})}</span>
    <span className={row.direction==='CALL'?'text-call':'text-put'}>{row.direction}</span>
    <span className="text-muted-foreground">{demoStrategyNames[row.entry_strategy] ?? row.entry_strategy}</span>
    <span className="font-mono text-[10px] text-muted-foreground">{money(Number(row.amount))}</span>
    <span className={`ml-auto font-mono ${row.result==='win'?'text-call':row.result==='loss'?'text-put':'text-muted-foreground'}`}>{row.result==='pending'?'ABERTA':`${row.result.toUpperCase()} · ${money(Number(row.profit))}`}</span>
   </div></HoverCardTrigger><HoverCardContent className="w-80 max-w-[calc(100vw-2rem)]"><p className="mb-1 text-xs font-medium">{row.asset} · previsão × fechamento</p><MiniChart candles={row.candles} direction={row.direction} entry={Date.parse(row.entry_minute)/1000}/><p className="mt-2 border-t border-border pt-2 text-xs text-muted-foreground">Entrada: {new Date(row.created_at).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'})}</p></HoverCardContent></HoverCard>)}
  </div>}
  {pages>1 && <div className="flex items-center justify-between gap-2"><Button variant="outline" size="sm" disabled={currentPage===0} onClick={()=>setPage(currentPage-1)}>Anterior</Button><span className="text-xs text-muted-foreground">{currentPage+1} / {pages}</span><Button variant="outline" size="sm" disabled={currentPage+1>=pages} onClick={()=>setPage(currentPage+1)}>Próxima</Button></div>}
 </section>;
}
