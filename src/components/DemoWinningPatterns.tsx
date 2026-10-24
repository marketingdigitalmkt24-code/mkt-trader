import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { winningPatterns,preEntryCandles,patternDistance,DEMO_VISIBLE_PATTERN_SCORES,DEMO_ANALYSIS_SCORE_CENTS } from '@/lib/demo-winning-patterns';
import { DEMO_PREFERRED_SCORE_CENTS,DEMO_REFERENCE_MAX_DISTANCE } from '../../supabase/functions/_shared/demo-continuation';
import { DemoPatternChart } from './DemoPatternChart';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Select,SelectContent,SelectItem,SelectTrigger,SelectValue } from './ui/select';

const time=(v:string)=>new Date(v).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
export function DemoWinningPatterns(){
 const {user}=useAuth();
 const queryClient=useQueryClient();
 const [score,setScore]=useState('226');
 const [page,setPage]=useState(0);
 const [reference,setReference]=useState<string|null>(null);
 const [comparison,setComparison]=useState('');
 useEffect(()=>{
  if(!user)return;
  let timer:ReturnType<typeof setTimeout>|undefined;
  const refresh=()=>{
   if(timer)clearTimeout(timer);
   timer=setTimeout(()=>{void queryClient.invalidateQueries({queryKey:['demo-winning-patterns',user.id]});},300);
  };
  const channel=supabase.channel(`demo-winning-patterns-${user.id}`)
   .on('postgres_changes',{event:'*',schema:'public',table:'iq_demo_test_orders'},refresh)
   .on('postgres_changes',{event:'*',schema:'public',table:'iq_demo_test_candidates'},refresh)
   .subscribe();
  return()=>{if(timer)clearTimeout(timer);void supabase.removeChannel(channel);};
 },[user?.id,queryClient]);
 const query=useQuery({queryKey:['demo-winning-patterns',user?.id],enabled:!!user,refetchInterval:10000,refetchIntervalInBackground:true,refetchOnWindowFocus:'always',queryFn:async()=>{
  const now=Date.now();
  const {data,error}=await supabase.from('iq_demo_test_candidates').select('signal_id,entry_minute,direction,asset,entry_strategy,score,candles')
   .not('candles','is',null).gte('entry_minute',new Date(now-14*86400000).toISOString())
   .lt('entry_minute',new Date(Math.floor(now/60000)*60000).toISOString()).order('entry_minute',{ascending:false}).limit(1000);
  if(error)throw error;
  const outcomes: {signal_id:string;result:string;status:string;iq_option_id:string|null}[]=[];
  for(let i=0;i<(data??[]).length;i+=200){
   const {data:orders,error:orderError}=await supabase.from('iq_demo_test_orders').select('signal_id,result,status,iq_option_id').in('signal_id',(data??[]).slice(i,i+200).map(c=>c.signal_id)).eq('status','confirmed').not('iq_option_id','is',null).in('result',['win','loss']);
   if(orderError)throw orderError;outcomes.push(...orders??[]);
  }
  return winningPatterns(data??[],outcomes,DEMO_VISIBLE_PATTERN_SCORES);
 }});
 const recent=useQuery({queryKey:['demo-pattern-comparison',user?.id],enabled:!!user,refetchInterval:10000,queryFn:async()=>{
  const {data,error}=await supabase.from('demo_selection_rejections').select('id,asset,direction,entry_minute,entry_strategy,score,candles').order('entry_minute',{ascending:false}).order('id').limit(100);
  if(error)throw error;return data??[];
 }});
 const rows=(query.data??[]).filter(c=>Math.round(c.score*100)===Number(score));
 const pages=Math.max(1,Math.ceil(rows.length/6));
 const current=Math.min(page,pages-1);
 const selected=rows.find(r=>r.signal_id===reference)??rows[0];
 const candidate=recent.data?.find(r=>r.id===comparison);
 const candidateCandles=candidate?preEntryCandles(candidate.candles,candidate.entry_minute):[];
 const distance=selected&&candidate?patternDistance(selected.candles,selected.entry_minute,selected.direction,candidateCandles,candidate.entry_minute,candidate.direction):null;
 return <section aria-label="Padrões vencedores" className="space-y-5">
  <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">Padrões vencedores por nota</h2><p className="mt-1 text-xs text-muted-foreground">WIN confirmado · Referências disponíveis para a próxima escolha · Brasília</p></div><Button variant="outline" size="sm" disabled={query.isFetching} onClick={()=>{query.refetch();recent.refetch();}}>Atualizar padrões</Button></div>
  <p className="text-xs text-muted-foreground" aria-live="polite">{query.dataUpdatedAt?`Atualizado às ${new Date(query.dataUpdatedAt).toLocaleTimeString('pt-BR',{timeZone:'America/Sao_Paulo'})}`:'Aguardando atualização'}{query.isFetching?' · Atualizando…':''}</p>
  {[{label:'Notas da regra',scores:DEMO_PREFERRED_SCORE_CENTS},{label:'Notas em análise',scores:DEMO_ANALYSIS_SCORE_CENTS}].filter(group=>group.scores.length>0).map(group=><div key={group.label} className="space-y-2"><h3 className="text-xs font-medium text-muted-foreground">{group.label}</h3><div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8" role="group" aria-label={group.label}>{group.scores.map(c=><Button key={c} variant={score===String(c)?'default':'outline'} className="h-auto min-h-12 flex-col gap-1 py-2" aria-pressed={score===String(c)} onClick={()=>{setScore(String(c));setPage(0);setReference(null);}}><span className="font-mono">{(c/100).toFixed(2).replace('.',',')}</span><span className="text-xs">{(query.data??[]).filter(r=>Math.round(r.score*100)===c).length} WIN</span></Button>)}</div></div>)}
  {query.isError&&query.data&&<p role="alert" className="text-sm text-destructive">Atualização indisponível. Os últimos gráficos permanecem visíveis; uma nova tentativa será feita automaticamente.</p>}
  {query.isPending?<p role="status" className="text-sm text-muted-foreground">Carregando gráficos vencedores…</p>:query.isError&&!query.data?<p role="alert" className="text-sm text-destructive">Não foi possível carregar os padrões.</p>:<>
   <div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-semibold">Nota {(Number(score)/100).toFixed(2).replace('.',',')}</h3><Badge variant="outline">{rows.length} gráficos WIN</Badge><span className="text-xs text-muted-foreground">Somente velas anteriores à entrada</span></div>
   {!rows.length?<p className="text-sm text-muted-foreground">Nenhum gráfico vencedor válido desta nota na janela atual da regra.</p>:<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{rows.slice(current*6,current*6+6).map(row=><article key={row.signal_id} className={`min-w-0 rounded-lg border bg-card p-4 ${selected?.signal_id===row.signal_id?'border-primary':'border-border'}`}>
    <div className="flex flex-wrap items-center justify-between gap-2"><h4 className="text-sm font-semibold">{row.asset}</h4><Badge variant="outline" className="text-call">WIN</Badge></div><p className="my-2 text-xs text-muted-foreground">{time(row.entry_minute)} · {row.entry_strategy}</p><DemoPatternChart candles={row.candles} direction={row.direction}/><Button variant="outline" size="sm" className="mt-3 w-full" onClick={()=>setReference(row.signal_id)}>{selected?.signal_id===row.signal_id?'Referência selecionada':'Comparar com este padrão'}</Button>
   </article>)}</div>}
   {pages>1&&<div className="flex items-center justify-between"><Button variant="outline" size="sm" disabled={current===0} onClick={()=>setPage(current-1)}>Anterior</Button><span className="text-xs text-muted-foreground">{current+1} / {pages}</span><Button variant="outline" size="sm" disabled={current+1>=pages} onClick={()=>setPage(current+1)}>Próxima</Button></div>}
   <section aria-label="Comparação de padrões" className="space-y-4 border-t border-border pt-5"><h3 className="text-sm font-semibold">Comparação lado a lado</h3><p className="text-xs text-muted-foreground">As referências ficam disponíveis antes da decisão; candidatos abaixo aparecem após a análise registrada, sem pausar a regra.</p>
    <Select value={comparison} onValueChange={setComparison}><SelectTrigger className="w-full max-w-xl" aria-label="Candidato para comparação"><SelectValue placeholder="Escolher análise recente registrada"/></SelectTrigger><SelectContent>{recent.data?.map(r=><SelectItem key={r.id} value={r.id}>{r.asset} · {r.direction} · {time(r.entry_minute)} · nota {r.score?.toFixed(2).replace('.',',')??'—'}</SelectItem>)}</SelectContent></Select>
    {recent.isError&&<p role="alert" className="text-sm text-destructive">Não foi possível carregar as análises recentes.</p>}
    {selected&&candidate&&<><div className="grid gap-6 md:grid-cols-2"><div className="min-w-0"><h4 className="mb-2 text-sm font-medium">WIN · {selected.asset} · {time(selected.entry_minute)}</h4><DemoPatternChart candles={selected.candles} direction={selected.direction}/></div><div className="min-w-0"><h4 className="mb-2 text-sm font-medium">Análise registrada · {candidate.asset} · {time(candidate.entry_minute)}</h4><DemoPatternChart candles={candidateCandles} direction={candidate.direction}/></div></div><p className={`text-sm ${distance!=null&&distance<=DEMO_REFERENCE_MAX_DISTANCE?'text-call':'text-muted-foreground'}`}>{distance==null?'Comparação indisponível':`Distância: ${distance.toLocaleString('pt-BR',{maximumFractionDigits:4})} · limite ${DEMO_REFERENCE_MAX_DISTANCE.toLocaleString('pt-BR')} · ${distance<=DEMO_REFERENCE_MAX_DISTANCE?'Corresponde a esta referência':'Não corresponde a esta referência'}`}</p></>}
   </section>
  </>}
 </section>;
}