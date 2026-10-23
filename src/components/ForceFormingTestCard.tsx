import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Activity, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { FORCE_FORMING_PAGE_SIZE, forceFormingPageRange } from '@/lib/force-forming-pagination';

export function ForceFormingTestCard() {
  const [page, setPage] = useState(1);
  const recent = useQuery({
    queryKey: ['force-forming-test', 'page', page], refetchInterval: 15000,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const [start, end] = forceFormingPageRange(page);
      const response = await supabase.from('force_anticipation_tests')
        .select('signal_id,asset,direction,created_at,result,profit', { count: 'exact' })
        .like('signal_id', 'force-forming-v1-%').order('created_at', { ascending: false })
        .order('id', { ascending: false }).range(start, end);
      if (response.error) throw response.error;
      return { rows: response.data ?? [], count: response.count ?? 0 };
    },
  });
  const { data, isLoading, isError } = useQuery({
    queryKey: ['force-forming-test', 'totals'], refetchInterval: 15000,
    queryFn: async () => {
      let wins = 0, losses = 0, confirmed = 0, checked = 0;
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
      return { wins, losses, confirmed, checked };
    },
  });
  const settled = (data?.wins ?? 0) + (data?.losses ?? 0);
  const totalPages = Math.max(1, Math.ceil((recent.data?.count ?? 0) / FORCE_FORMING_PAGE_SIZE));
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
      {recent.data?.rows.map(row => <div key={row.signal_id} className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
        <span className="font-medium">{row.asset}</span>
        <span className="font-mono text-muted-foreground">{new Date(row.created_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
        <span className={row.direction === 'PUT' ? 'text-put' : 'text-call'}>{row.direction}</span>
        <span className="ml-auto font-mono">{row.result === 'open' ? 'ABERTO' : row.result.toUpperCase()} · {Number(row.profit).toLocaleString('pt-BR', { style: 'currency', currency: 'USD' })}</span>
      </div>)}
      {isLoading || recent.isLoading ? <p className="text-xs text-muted-foreground">Carregando…</p>
        : isError || recent.isError ? <p role="alert" className="text-xs text-destructive">Não foi possível carregar os testes.</p>
        : !recent.data?.rows.length ? <p className="text-xs text-muted-foreground">Nenhum teste registrado.</p> : null}
    </div>
    <nav aria-label="Páginas de Força em formação" className="mt-3 flex items-center justify-end gap-2">
      {recent.isFetching && <Loader2 aria-label="Atualizando operações" className="h-3 w-3 animate-spin text-muted-foreground" />}
      <Button variant="ghost" size="icon" aria-label="Página anterior de Força em formação" title="Página anterior" disabled={page <= 1 || recent.isFetching} onClick={() => setPage(p => p - 1)}><ChevronLeft /></Button>
      <span className="text-xs text-muted-foreground">{page} / {totalPages}</span>
      <Button variant="ghost" size="icon" aria-label="Próxima página de Força em formação" title="Próxima página" disabled={page >= totalPages || recent.isFetching} onClick={() => setPage(p => p + 1)}><ChevronRight /></Button>
    </nav>
  </CardContent></Card>;
}