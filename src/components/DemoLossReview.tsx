import {useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {ChevronLeft,ChevronRight,RefreshCw,TrendingDown} from 'lucide-react';
import {supabase} from '@/integrations/supabase/client';
import {useAuth} from '@/contexts/AuthContext';
import {lossReview,readLossCandles} from '@/lib/demo-loss-review';
import {MiniChart} from './DemoTestOperations';
import {Button} from './ui/button';
import {Input} from './ui/input';
import {Badge} from './ui/badge';
import {Select,SelectContent,SelectItem,SelectTrigger,SelectValue} from './ui/select';

const names:Record<string,string>={TENDENCIA:'Tendência',VELA_FORCA:'Vela de Força',REVERSAO_RSI:'Reversão RSI',CONTINUACAO_QUEDA_V1:'Queda',TETO_V1:'Teto',QUEDA_WIN_CALL_V1:'Queda win',QUEDA_WIN_RETRY_V1:'Queda win +1',FORCA_PADRAO_V1:'Força padrão',ICHIMOKU_FORCA:'Ichimoku + Vela de Força',KDJ_RSI:'KDJ + Reversão RSI'};
const number=(v:number)=>v.toLocaleString('pt-BR',{maximumFractionDigits:15});
const money=(v:number)=>v.toLocaleString('pt-BR',{style:'currency',currency:'USD'});
const time=(seconds:number)=>new Date(seconds*1000).toLocaleTimeString('pt-BR',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit'});

export function DemoLossReview(){
 const {user}=useAuth();
 const [period,setPeriod]=useState('all'),[asset,setAsset]=useState(''),[strategy,setStrategy]=useState('all'),[page,setPage]=useState(0);
 const query=useQuery({queryKey:['demo-loss-review',user?.id,period,asset,strategy,page],enabled:!!user,refetchInterval:10000,queryFn:async()=>{
  let request=supabase.from('iq_demo_test_orders').select('id,signal_id,asset,direction,entry_strategy,amount,profit,created_at,entry_minute,expiration_time',{count:'exact'})
   .eq('status','confirmed').eq('account_type','PRACTICE').eq('result','loss').not('iq_option_id','is',null);
  if(period==='today'){
   const start=Date.parse(`${new Date(Date.now()-3*3600000).toISOString().slice(0,10)}T03:00:00Z`);
   request=request.gte('entry_minute',new Date(start).toISOString()).lt('entry_minute',new Date(start+86400000).toISOString());
  }else if(period==='7d')request=request.gte('entry_minute',new Date(Date.now()-7*86400000).toISOString());
  const search=asset.trim().replace(/[%_]/g,'');
  if(search)request=request.ilike('asset',`%${search}%`);
  if(strategy!=='all')request=request.eq('entry_strategy',strategy);
  const {data,error,count}=await request.order('entry_minute',{ascending:false}).order('id').range(page*6,page*6+5);
  if(error)throw error;
  const ids=(data??[]).map(r=>r.signal_id);
  const charts=ids.length?await supabase.from('iq_demo_test_candidates').select('signal_id,score,candles,pattern_match').in('signal_id',ids):{data:[],error:null};
  if(charts.error)throw charts.error;
  const snapshots=new Map((charts.data??[]).map(c=>[c.signal_id,c]));
  return {count:count??0,rows:(data??[]).map(r=>({...r,snapshot:snapshots.get(r.signal_id)}))};
 }});
 const pages=Math.max(1,Math.ceil((query.data?.count??0)/6));
 return <section aria-label="Perdas Demo" className="space-y-5">
  <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="flex items-center gap-2 text-lg font-semibold"><TrendingDown className="h-5 w-5 text-put"/>Perdas · Demo</h2><p className="mt-1 text-xs text-muted-foreground">LOSS confirmado na corretora · Horários de Brasília · {query.data?.count??'—'} operações</p></div><Button variant="outline" size="icon" title="Atualizar perdas" aria-label="Atualizar perdas" disabled={query.isFetching} onClick={()=>query.refetch()}><RefreshCw className="h-4 w-4"/></Button></div>
  <div className="grid gap-3 sm:grid-cols-3">
   <div className="space-y-1"><label className="text-xs text-muted-foreground" htmlFor="loss-period">Período</label><Select value={period} onValueChange={v=>{setPeriod(v);setPage(0);}}><SelectTrigger id="loss-period"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="all">Todo o histórico</SelectItem><SelectItem value="today">Hoje</SelectItem><SelectItem value="7d">Últimos 7 dias</SelectItem></SelectContent></Select></div>
   <div className="space-y-1"><label className="text-xs text-muted-foreground" htmlFor="loss-asset">Ativo</label><Input id="loss-asset" value={asset} placeholder="Todos os ativos" onChange={e=>{setAsset(e.target.value);setPage(0);}}/></div>
   <div className="space-y-1"><label className="text-xs text-muted-foreground" htmlFor="loss-strategy">Estratégia</label><Select value={strategy} onValueChange={v=>{setStrategy(v);setPage(0);}}><SelectTrigger id="loss-strategy"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="all">Todas as estratégias</SelectItem>{Object.entries(names).map(([key,label])=><SelectItem key={key} value={key}>{label}</SelectItem>)}</SelectContent></Select></div>
  </div>
  {query.isPending?<p role="status" className="text-sm text-muted-foreground">Carregando perdas e velas…</p>:query.isError?<div role="alert" className="flex items-center gap-3 text-sm text-destructive">Não foi possível carregar as perdas.<Button variant="outline" size="sm" onClick={()=>query.refetch()}>Tentar novamente</Button></div>:!query.data?.rows.length?<p className="py-8 text-sm text-muted-foreground">Nenhuma perda confirmada neste filtro.</p>:<div className="grid gap-4 xl:grid-cols-2">
   {query.data.rows.map(row=>{
    const candles=readLossCandles(row.snapshot?.candles),entry=Date.parse(row.entry_minute)/1000,score=row.snapshot?.score??null;
    const review=lossReview(candles,entry,row.direction,score);
    const result=review.comparison;
    const shown=candles.filter(c=>c.t>=entry-5*60 && c.t<=entry+60 && c.t+60<=Date.now()/1000);
    return <article key={row.id} aria-label={`Perda ${row.asset}`} className="min-w-0 rounded-lg border border-border bg-card p-4 space-y-4">
     <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="break-words font-semibold">{row.asset}</h3><div className="flex items-center gap-2"><Badge variant="outline" className={row.direction==='PUT'?'text-put':'text-call'}>{row.direction}</Badge><strong className="font-mono text-sm text-put">LOSS · {money(Number(row.profit))}</strong></div></div>
     <p className="text-xs text-muted-foreground">{new Date(row.created_at).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'})} · {names[row.entry_strategy]??row.entry_strategy} · Entrada {money(Number(row.amount))}</p>
     <div className="border-y border-border py-2 text-sm"><span className="text-muted-foreground">Nota calculada </span><strong className="break-all font-mono">{score===null?'Não registrada':number(score)}</strong>{score!==null&&<span className="block text-xs text-muted-foreground">Nota exibida {score.toFixed(2).replace('.',',')}</span>}</div>
     <MiniChart candles={candles.length?candles:null} direction={row.direction} entry={entry}/>
     <div className="space-y-2 text-sm"><h4 className="font-semibold">O que falhou / evidências</h4>
      <p>{!result?'Vela fechada do resultado não disponível; a causa gráfica não pode ser confirmada.':result.agrees===false?`A vela do resultado ${result.movement==='up'?'subiu':'caiu'}, contrariando a direção ${row.direction}.`:result.agrees===true?'A vela fechou a favor do sinal, mas a corretora confirmou LOSS. Sem o preço exato de execução, o gráfico do minuto não explica a perda.':'A vela do resultado ficou sem variação; o LOSS é da corretora, não uma conclusão do gráfico.'}</p>
      {review.previous&&<p className="text-muted-foreground">Antes da entrada: {review.streak} vela{review.streak===1?'':'s'} seguida{review.streak===1?'':'s'} {review.previous.c>review.previous.o?'de alta':review.previous.c<review.previous.o?'de baixa':'sem variação'}; última vela com corpo de {review.previousBody===null?'—':review.previousBody.toFixed(1).replace('.',',')}% da amplitude.</p>}
      {review.roundedOnly&&<p className="text-put">Não passaria pela regra atual de nota exata: {number(score??0)} não é {number(review.requiredScore??0)}. Esta verificação não prova qual regra estava vigente na entrada.</p>}
      <p className="text-xs text-muted-foreground">{row.snapshot?.pattern_match?'Correspondência com padrão vencedor registrada.':'Sem correspondência com padrão vencedor registrada.'} Indicadores e parcelas da nota não foram registrados; não é possível afirmar qual condição histórica da estratégia falhou.</p>
     </div>
     <details><summary className="cursor-pointer text-sm font-medium">Velas · abertura, máxima, mínima e fechamento</summary><div className="mt-3 overflow-x-auto"><table className="w-full text-xs"><thead className="text-muted-foreground"><tr>{['BRT','Abertura','Máxima','Mínima','Fechamento'].map(h=><th key={h} className="p-1 text-right first:text-left">{h}</th>)}</tr></thead><tbody>{shown.map(c=><tr key={c.t} className={c.t===entry?'bg-muted':'border-t border-border'}><td className="whitespace-nowrap p-1">{time(c.t)}{c.t===entry?' · resultado':c.t===entry+60?' · +1':''}</td>{[c.o,c.h,c.l,c.c].map((v,i)=><td key={i} className="p-1 text-right font-mono">{v.toFixed(5).replace('.',',')}</td>)}</tr>)}</tbody></table>{!shown.length&&<p className="py-2 text-muted-foreground">Velas não disponíveis.</p>}</div></details>
    </article>;
   })}
  </div>}
  {pages>1&&<div className="flex items-center justify-between gap-2"><Button variant="outline" size="icon" title="Página anterior" aria-label="Página anterior de perdas" disabled={page===0} onClick={()=>setPage(page-1)}><ChevronLeft className="h-4 w-4"/></Button><span className="text-xs text-muted-foreground">Página {page+1} de {pages}</span><Button variant="outline" size="icon" title="Próxima página" aria-label="Próxima página de perdas" disabled={page+1>=pages} onClick={()=>setPage(page+1)}><ChevronRight className="h-4 w-4"/></Button></div>}
 </section>;
}