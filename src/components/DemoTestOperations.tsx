import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export function DemoTestOperations() {
 const [page,setPage]=useState(0);
 const {data,isLoading,isError}=useQuery({queryKey:['demo-test-orders',page],refetchInterval:10000,queryFn:async()=>{
 const {data,count,error}=await supabase.from('iq_demo_test_orders').select('*',{count:'exact'}).order('created_at',{ascending:false}).range(page*10,page*10+9);
 if(error)throw error;return {rows:data || [],count:count || 0};
 }});
 return <section className="mb-4 border-b border-border pb-4" aria-label="Últimas operações Demo">
 <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><h4 className="text-xs font-medium">Últimas operações · Demo</h4><Badge variant="outline">US$1 · TESTE</Badge></div>
 {isLoading?<p className="text-xs text-muted-foreground">Carregando ordens Demo…</p>:isError?<p role="alert" className="text-xs text-destructive">Não foi possível carregar as ordens Demo.</p>:!data?.rows.length?<p className="text-xs text-muted-foreground">Aguardando primeira ordem Demo confirmada.</p>:<div className="space-y-1">{data.rows.map(row=><div key={row.id} className="flex flex-wrap items-center gap-2 rounded-md bg-secondary/30 p-2 text-xs">
 <span className="font-medium">{row.asset}</span><span className="text-muted-foreground font-mono text-[10px]">{new Date(row.created_at).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'})}</span>
 <span className={row.direction==='CALL'?'text-call':'text-put'}>{row.direction}</span><span className="text-muted-foreground">{row.entry_strategy}</span>
 {row.iq_option_id && <span className="font-mono text-[10px]">#{row.iq_option_id}</span>}
 <span className="ml-auto font-mono">{row.status==='confirmed'?(row.result==='pending'?'ABERTA':`${row.result.toUpperCase()} · ${Number(row.profit).toLocaleString('pt-BR',{style:'currency',currency:'USD'})}`):row.status==='failed'?'NÃO ENVIADA':row.status==='unknown'?'SEM CONFIRMAÇÃO':'AGUARDANDO'}</span>
 </div>)}</div>}
 {(data?.count || 0)>10 && <div className="mt-2 flex items-center justify-between"><Button variant="ghost" size="sm" disabled={page===0} onClick={()=>setPage(p=>p-1)}><ChevronLeft className="h-3 w-3"/>Anterior</Button><span className="text-xs text-muted-foreground">{page+1}/{Math.ceil((data?.count || 0)/10)}</span><Button variant="ghost" size="sm" disabled={(page+1)*10>=(data?.count || 0)} onClick={()=>setPage(p=>p+1)}>Próxima<ChevronRight className="h-3 w-3"/></Button></div>}
 </section>;
}
