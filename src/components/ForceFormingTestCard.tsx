import { useQuery } from '@tanstack/react-query';
import { Activity } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from './ui/card';
import { Badge } from './ui/badge';

export function ForceFormingTestCard() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['force-forming-test'], refetchInterval: 15000,
    queryFn: async () => {
      let wins = 0, losses = 0, confirmed = 0, checked = 0;
      const recent = await supabase.from('force_anticipation_tests')
        .select('signal_id,asset,direction,created_at,result,profit')
        .like('signal_id', 'force-forming-v1-%').order('created_at', { ascending: false }).limit(8);
      if (recent.error) throw recent.error;
      for (let offset = 0; ; offset += 1000) {
        const page = await supabase.from('force_anticipation_tests').select('result,indicators')
          .like('signal_id', 'force-forming-v1-%').order('created_at').order('id').range(offset, offset + 999);
        if (page.error) throw page.error;
        for (const row of page.data ?? []) {
          if (row.result === 'win') wins++;
          if (row.result === 'loss') losses++;
          const indicators = row.indicators;
          if (indicators && typeof indicators === 'object' && !Array.isArray(indicators)
            && typeof indicators.forceConfirmed === 'boolean') {
            checked++;
            if (indicators.forceConfirmed) confirmed++;
          }
        }
        if ((page.data?.length ?? 0) < 1000) break;
      }
      return { wins, losses, confirmed, checked, recent: recent.data ?? [] };
    },
  });
  const settled = (data?.wins ?? 0) + (data?.losses ?? 0);
  const percent = (n: number, total: number) => total ? `${(n / total * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%` : '—';
  return <Card><CardContent className="p-3 sm:p-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="flex items-center gap-2 text-sm font-semibold"><Activity className="h-4 w-4 text-gold" />Força em formação</h3>
      <Badge variant="outline">TESTE</Badge>
    </div>
    <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs">
      <span>Acerto: <strong>{percent(data?.wins ?? 0, settled)}</strong> · {data?.wins ?? 0}W / {data?.losses ?? 0}L</span>
      <span>Vela de Força confirmada: <strong>{data?.confirmed ?? 0}/{data?.checked ?? 0}</strong></span>
    </div>
    <div className="mt-3 space-y-2">
      {data?.recent.map(row => <div key={row.signal_id} className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
        <span className="font-medium">{row.asset}</span>
        <span className="font-mono text-muted-foreground">{new Date(row.created_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
        <span className={row.direction === 'PUT' ? 'text-put' : 'text-call'}>{row.direction}</span>
        <span className="ml-auto font-mono">{row.result === 'open' ? 'ABERTO' : row.result.toUpperCase()} · {Number(row.profit).toLocaleString('pt-BR', { style: 'currency', currency: 'USD' })}</span>
      </div>)}
      {isLoading ? <p className="text-xs text-muted-foreground">Carregando…</p>
        : isError ? <p role="alert" className="text-xs text-destructive">Não foi possível carregar os testes.</p>
        : !data?.recent.length ? <p className="text-xs text-muted-foreground">Nenhum teste registrado.</p> : null}
    </div>
  </CardContent></Card>;
}