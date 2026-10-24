import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Badge } from './ui/badge';

const number = (v: unknown) => typeof v === 'number' ? v.toLocaleString('pt-BR', { maximumFractionDigits: 6 }) : 'indisponível';
function reasonText(code: string, details: unknown) {
 const d = details && typeof details === 'object' && !Array.isArray(details) ? details as Record<string, unknown> : {};
 switch(code) {
  case 'learned_history': return `Aprendizado ${number(d.learned)} ≤ limite ${number(d.maximum)}. Histórico desfavorável bloqueou a escolha.`;
  case 'score_floor': return `Nota calculada ${number(d.score)} abaixo do mínimo ${number(d.minimum)}. O bloqueio usa a nota sem arredondar.`;
  case 'reference_mismatch': return `Gráfico não correspondeu à GEV nem às referências WIN disponíveis; distância máxima permitida ${number(d.maximum_distance)}.`;
  case 'eight_pattern_mismatch': return d.distance == null ? 'Não havia comparação válida com gráficos WIN confirmados disponíveis na análise.' : `Distância do gráfico ${number(d.distance)} acima do máximo ${number(d.maximum_distance)} para os padrões WIN disponíveis na análise.`;
  case 'priority_unavailable': return 'Leitura das prioridades do histórico indisponível naquele minuto. Seleção bloqueada por segurança.';
  case 'minute_priority': return `Passou pelos bloqueios, mas outro candidato teve prioridade no único lugar do minuto. Selecionado: ${String(d.selected_signal ?? 'não registrado')}.`;
  default: return `Motivo registrado: ${code}`;
 }
}

export function DemoRejectedOperations({ period, score }: { period: string; score: string }) {
 const { user } = useAuth();
 const [page, setPage] = useState(0);
 const [exact, setExact] = useState('');
 const wanted = exact.trim().replace(',', '.') || score;
 const valid = wanted === 'all' || wanted === 'unscored' || /^\d+(\.\d{1,2})?$/.test(wanted);
 const query = useQuery({queryKey:['demo-selection-rejections',user?.id,period,wanted,page],enabled:!!user && valid,refetchInterval:30000,queryFn:async()=>{
  let request = supabase.from('demo_selection_rejections').select('id,entry_minute,asset,direction,entry_strategy,score,reason_code,reason_details',{count:'exact'});
  const now = Date.now();
  if(period==='today') {
   const start = Date.parse(`${new Date(now-3*3600000).toISOString().slice(0,10)}T03:00:00Z`);
   request = request.gte('entry_minute',new Date(start).toISOString()).lt('entry_minute',new Date(start+86400000).toISOString());
  } else if(period==='7d') request = request.gte('entry_minute',new Date(now-7*86400000).toISOString());
  if(wanted==='unscored') request=request.is('score',null);
  else if(wanted!=='all') request=request.gte('score',Number(wanted)-0.005).lt('score',Number(wanted)+0.005);
  const {data,error,count}=await request.order('entry_minute',{ascending:false}).order('id').range(page*10,page*10+9);
  if(error)throw error;
  return {rows:data??[],count:count??0};
 }});
 const pages=Math.max(1,Math.ceil((query.data?.count??0)/10));
 return <section aria-label="Operações rejeitadas" className="space-y-4 border-t border-border pt-5">
  <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="text-sm font-semibold">Operações rejeitadas <span className="font-normal text-muted-foreground">({query.data?.count??0})</span></h3><Button variant="outline" size="sm" onClick={()=>query.refetch()} disabled={!valid||query.isFetching}>Atualizar rejeições</Button></div>
  <div className="max-w-xs space-y-1"><label htmlFor="rejected-exact-score" className="text-xs text-muted-foreground">Nota exata das rejeições</label><Input id="rejected-exact-score" inputMode="decimal" placeholder={score==='all'?'Todas as notas':score.replace('.',',')} value={exact} onChange={e=>{setExact(e.target.value);setPage(0);}}/></div>
  <p className="text-xs text-muted-foreground">Somente decisões registradas a partir de agora · Brasília. Sem ordem enviada e sem resultado WIN/LOSS; não entram no saldo ou na taxa de acerto.</p>
  {!valid ? <p className="text-sm text-destructive">Informe uma nota com até duas casas decimais.</p> : query.isPending ? <p role="status" className="text-sm text-muted-foreground">Carregando rejeições…</p> : query.isError ? <p role="alert" className="text-sm text-destructive">Não foi possível carregar as rejeições. Tente atualizar.</p> : !query.data?.rows.length ? <p className="text-sm text-muted-foreground">Nenhuma rejeição registrada para este período e nota.</p> : <ul className="divide-y divide-border">{query.data.rows.map(row=><li key={row.id} className="space-y-2 py-4">
   <div className="flex flex-wrap items-center gap-2"><strong className="text-sm">{row.asset}</strong><Badge variant="outline" className={row.direction==='CALL'?'text-call':'text-put'}>{row.direction}</Badge><span className="font-mono text-sm">Nota {row.score==null?'—':row.score.toFixed(2).replace('.',',')}</span><Badge variant="outline">{row.reason_code==='minute_priority'?'Sem prioridade no minuto':'Bloqueada'}</Badge></div>
   <p className="text-xs text-muted-foreground">{new Date(row.entry_minute).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})} · {row.entry_strategy}</p>
   <p className="break-words text-sm">{reasonText(row.reason_code,row.reason_details)}</p>
  </li>)}</ul>}
  {pages>1&&<div className="flex items-center justify-between gap-2"><Button variant="outline" size="sm" disabled={page===0} onClick={()=>setPage(page-1)}>Anterior</Button><span className="text-xs text-muted-foreground">{page+1} / {pages}</span><Button variant="outline" size="sm" disabled={page+1>=pages} onClick={()=>setPage(page+1)}>Próxima</Button></div>}
 </section>;
}