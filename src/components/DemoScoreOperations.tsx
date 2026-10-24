import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { MiniChart } from './DemoTestOperations';
import { Button } from './ui/button';
import { Badge } from './ui/badge';

type Candle = {t:number;o:number;c:number;h:number;l:number};
function candlesFromJson(value: unknown): Candle[] | null {
 if (!Array.isArray(value)) return null;
 const candles = value.filter((c): c is Candle => c != null && typeof c === 'object' &&
  ['t','o','c','h','l'].every(key => typeof c[key] === 'number' && Number.isFinite(c[key])));
 return candles.length ? candles : null;
}
const money = (value:number) => value.toLocaleString('pt-BR',{style:'currency',currency:'USD'});
const names: Record<string,string> = {TENDENCIA:'Tendência', VELA_FORCA:'Vela de Força', CONTINUACAO_QUEDA_V1:'Queda', TETO_V1:'Teto', QUEDA_WIN_CALL_V1:'Queda win',QUEDA_WIN_RETRY_V1:'Queda win +1',FORCA_PADRAO_V1:'Força padrão'};

export function DemoScoreOperations({ids,score}:{ids:string[];score:string}) {
 const [page,setPage] = useState(0);
 const pages = Math.max(1,Math.ceil(ids.length/6));
 const currentPage = Math.min(page,pages-1);
 const pageIds = ids.slice(currentPage*6,currentPage*6+6);
 const query = useQuery({queryKey:['demo-score-operation-charts',pageIds],enabled:pageIds.length>0,refetchInterval:30000,queryFn:async()=>{
  const {data:orders,error} = await supabase.from('iq_demo_test_orders')
   .select('id,signal_id,asset,direction,entry_strategy,amount,result,profit,created_at,entry_minute')
   .eq('status','confirmed').eq('account_type','PRACTICE').not('iq_option_id','is',null).in('id',pageIds);
  if(error) throw error;
  const signals=(orders ?? []).map(r=>r.signal_id);
  const {data:charts,error:chartError} = signals.length ? await supabase.from('iq_demo_test_candidates')
   .select('signal_id,candles').in('signal_id',signals) : {data:[],error:null};
  if(chartError) throw chartError;
  const snapshots = new Map((charts ?? []).map(c=>[c.signal_id,candlesFromJson(c.candles)]));
  return (orders ?? []).sort((a,b)=>pageIds.indexOf(a.id)-pageIds.indexOf(b.id)).map(row=>({...row,candles:snapshots.get(row.signal_id)}));
 }});
 return <section aria-label="Operações da nota selecionada" className="space-y-4 border-t border-border pt-5">
  <h3 className="text-sm font-semibold">Operações · nota {score.replace('.',',')} <span className="font-normal text-muted-foreground">({ids.length})</span></h3>
  {query.isPending ? <p role="status" className="text-sm text-muted-foreground">Carregando operações e gráficos…</p> : query.isError ? <div role="alert" className="flex flex-wrap items-center gap-3"><p className="text-sm text-destructive">Não foi possível carregar as operações e os gráficos.</p><Button variant="outline" size="sm" onClick={()=>query.refetch()}>Tentar novamente</Button></div> : <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
   {query.data?.map(row=><article key={row.id} aria-label={`Operação ${row.asset}`} className="min-w-0 rounded-lg border border-border bg-card p-4">
    <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><h4 className="text-sm font-semibold">{row.asset}</h4><Badge variant="outline" className={row.direction==='CALL'?'text-call':'text-put'}>{row.direction}</Badge></div>
    <p className="mb-2 text-xs text-muted-foreground">{new Date(row.created_at).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'})} · {names[row.entry_strategy] ?? row.entry_strategy}</p>
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-xs"><span className="font-mono">Entrada {money(Number(row.amount))}</span><strong className={`font-mono ${row.result==='win'?'text-call':row.result==='loss'?'text-put':'text-muted-foreground'}`}>{row.result==='pending'?'ABERTA':`${row.result.toUpperCase()} · ${money(Number(row.profit))}`}</strong></div>
    <MiniChart candles={row.candles} direction={row.direction} entry={Date.parse(row.entry_minute)/1000}/>
   </article>)}
  </div>}
  {pages>1 && <div className="flex items-center justify-between gap-2"><Button variant="outline" size="sm" disabled={currentPage===0} onClick={()=>setPage(currentPage-1)}>Anterior</Button><span className="text-xs text-muted-foreground">{currentPage+1} / {pages}</span><Button variant="outline" size="sm" disabled={currentPage+1>=pages} onClick={()=>setPage(currentPage+1)}>Próxima</Button></div>}
 </section>;
}