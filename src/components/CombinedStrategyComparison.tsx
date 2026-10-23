import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from './ui/badge';

const labels: Record<string,string> = {
  TEST_ICHIMOKU_FORCA_V1:'Ichimoku + Vela de Força', REF_ICHIMOKU_V1:'Ichimoku', REF_VELA_FORCA_V1:'Vela de Força',
  TEST_KDJ_RSI_V1:'KDJ + Reversão RSI', REF_KDJ_V1:'KDJ', REF_REVERSAO_RSI_V1:'Reversão RSI',
};
export function CombinedStrategyComparison() {
  const query = useQuery({
    queryKey:['combined-strategy-comparison-v1'], refetchInterval:15000,
    queryFn:async()=>{
      const stats=Object.fromEntries(Object.keys(labels).map(s=>[s,{wins:0,losses:0,ties:0,open:0,profit:0}]));
      for(let offset=0;;offset+=1000){
        const {data,error}=await supabase.from('force_anticipation_tests').select('indicators,result,profit')
          .like('signal_id','combo-test-v1-%').order('created_at').order('id').range(offset,offset+999);
        if(error) throw error;
        for(const row of data||[]){
          const indicators=row.indicators;
          if(!indicators||typeof indicators!=='object'||Array.isArray(indicators)||typeof indicators.strategy!=='string')continue;
          const stat=stats[indicators.strategy]; if(!stat)continue;
          if(row.result==='win')stat.wins++;
          if(row.result==='loss')stat.losses++;
          if(row.result==='tie')stat.ties++;
          if(row.result==='open')stat.open++;
          if(['win','loss','tie'].includes(row.result))stat.profit+=Number(row.profit);
        }
        if((data?.length||0)<1000)break;
      }
      return stats;
    },
  });
  return <section aria-label="Comparação das combinações TESTE" className="mt-3 border-t border-border/40 pt-3">
    <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><h4 className="text-xs font-semibold">Combinações · Comparação prospectiva</h4><Badge variant="outline">TESTE</Badge></div>
    <div className="space-y-2">{Object.entries(labels).map(([key,label])=>{
      const stat=query.data?.[key]; const closed=(stat?.wins||0)+(stat?.losses||0);
      return <div key={key} className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="min-w-0 break-words">{label}</span>
        <span className="flex flex-wrap justify-end gap-x-2 font-mono text-muted-foreground">
          <span>{stat?.wins||0}W / {stat?.losses||0}L</span>
          <span>{closed?`${((stat?.wins||0)/closed*100).toLocaleString('pt-BR',{maximumFractionDigits:1})}%`:'—'}</span>
          <span className={(stat?.profit||0)<0?'text-put':'text-call'}>{(stat?.profit||0).toLocaleString('pt-BR',{style:'currency',currency:'USD'})}</span>
          {!!stat?.open&&<span>{stat.open} aberto(s)</span>}
          {!!stat?.ties&&<span>{stat.ties} empate(s)</span>}
        </span>
      </div>;
    })}</div>
    {query.isError&&<p role="alert" className="mt-2 text-xs text-destructive">Não foi possível carregar a comparação.</p>}
  </section>;
}