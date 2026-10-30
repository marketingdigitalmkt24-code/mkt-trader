import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { useGlobalIQResetCutoff } from '@/hooks/useGlobalIQResetCutoff';
import { combineCutoffs, getIQResultsReset, IQ_RESULTS_RESET_EVENT } from '@/lib/iq-results-reset';
import { clientDailyHistory, clientDailyPage, type ClientDailyRow } from '@/lib/client-daily-history';
import { formatAccountMoney } from '@/lib/account-currency';
import { copyResultRates } from '@/lib/admin-copy-results';

export function ClientDailyResults({ userId, currency }: { userId: string; currency?: string | null }) {
  const [page, setPage] = useState(0);
  const globalCutoff = useGlobalIQResetCutoff();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['admin-client-daily-results', userId],
    refetchInterval: 10000,
    queryFn: async () => {
      const rows: ClientDailyRow[] = [];
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await supabase.from('operation_results')
          .select('id, signal_id, created_at, result, profit, iq_option_id, timeframe, entry_strategy')
          .like('signal_id', `copy-${userId}-%`).not('iq_option_id', 'is', null)
          .not('timeframe', 'in', '(TEST,MT5)').in('result', ['win', 'loss', 'draw', 'tie'])
          .order('created_at', { ascending: false }).order('id', { ascending: false })
          .range(offset, offset + 999);
        if (error) throw error;
        rows.push(...(data ?? []));
        if (!data || data.length < 1000) return rows;
      }
    },
  });
  useEffect(() => {
    const reload = () => { void queryClient.invalidateQueries({ queryKey: ['admin-client-daily-results', userId] }); };
    const channel = supabase.channel(`admin-client-daily-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'operation_results' }, reload).subscribe();
    window.addEventListener(IQ_RESULTS_RESET_EVENT, reload);
    return () => { window.removeEventListener(IQ_RESULTS_RESET_EVENT, reload); void supabase.removeChannel(channel); };
  }, [userId, queryClient]);
  const days = clientDailyHistory(query.data ?? [], userId, combineCutoffs(getIQResultsReset(userId), globalCutoff));
  const paged = clientDailyPage(days, page);

  return <section id={`client-history-${userId}`} aria-label="Histórico diário do cliente" className="w-full border-t border-border pt-3 mt-1">
    <h4 className="text-xs font-semibold text-muted-foreground mb-2">Histórico de resultados</h4>
    {query.isLoading ? <Loader2 aria-label="Carregando histórico" className="w-5 h-5 animate-spin mx-auto my-4" />
      : query.isError ? <p className="text-xs text-destructive py-3">Não foi possível atualizar o histórico.</p>
      : days.length === 0 ? <p className="text-xs text-muted-foreground py-3">Nenhuma operação copiada com resultado confirmado.</p>
      : <>
        <div className="overflow-x-auto">
          <table className="w-full text-xs tabular-nums">
            <thead className="text-muted-foreground"><tr className="border-b border-border">
              <th className="text-left py-2 font-medium">Dia</th><th className="text-right px-2 font-medium">WIN</th><th className="text-right px-2 font-medium">LOSS</th><th className="text-right px-2 font-medium">Empates</th><th className="text-right px-2 font-medium">Acerto</th><th className="text-right py-2 font-medium">Resultado</th>
            </tr></thead>
            <tbody>{paged.days.map(day => <tr key={day.date} className="border-b border-border/50">
              <td className="py-3 whitespace-nowrap">{day.date.split('-').reverse().join('/')}</td>
              <td className="text-right px-2 text-call">{day.wins}</td><td className="text-right px-2 text-put">{day.losses}</td><td className="text-right px-2">{day.ties}</td>
              <td className="text-right px-2">{copyResultRates(day.wins, day.losses).winPercent.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%</td>
              <td className={`text-right py-3 font-semibold whitespace-nowrap ${day.profit < 0 ? 'text-put' : 'text-call'}`}>{formatAccountMoney(day.profit, currency, true)}</td>
            </tr>)}</tbody>
          </table>
        </div>
        <div className="flex justify-between items-center mt-2">
          <Button variant="ghost" size="sm" disabled={paged.page === 0} onClick={() => setPage(paged.page - 1)}><ChevronLeft className="w-4 h-4 mr-1" />Anterior</Button>
          <span className="text-xs text-muted-foreground">{paged.page + 1}/{paged.totalPages}</span>
          <Button variant="ghost" size="sm" disabled={paged.page >= paged.totalPages - 1} onClick={() => setPage(paged.page + 1)}>Próxima<ChevronRight className="w-4 h-4 ml-1" /></Button>
        </div>
      </>}
  </section>;
}