import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import type { ClientCopyOperation } from '@/lib/client-copy-results';
import { historyStart } from '@/components/dayLabel';

// Histórico de entradas copiadas do cliente (últimos 30 dias), sem estratégia.
export function useClientCopyHistory() {
  const { user } = useAuth();
  const userId = user?.id;
  const query = useQuery({
    queryKey: ['client-copy-history', userId],
    enabled: Boolean(userId),
    refetchInterval: 10000,
    queryFn: async () => {
      if (!userId) return [] as ClientCopyOperation[];
      const rows: ClientCopyOperation[] = [];
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await supabase.from('operation_results')
          .select('id, signal_id, asset, direction, result, profit, created_at, iq_option_id, timeframe, entry_strategy')
          .like('signal_id', `copy-${userId}-%`)
          .not('iq_option_id', 'is', null)
          .not('timeframe', 'in', '(TEST,MT5)')
          .or('entry_strategy.is.null,entry_strategy.neq.FORCE_LOSS_WIN')
          .not('signal_id', 'like', '%force-lw-%')
          .not('signal_id', 'like', '%forca_invertida-%')
          .gte('created_at', historyStart())
          .order('created_at', { ascending: false }).order('id', { ascending: false })
          .range(offset, offset + 999);
        if (error) throw error;
        rows.push(...(data || []));
        if (!data || data.length < 1000) return rows;
      }
    },
  });
  return { operations: query.data || [], isLoading: query.isLoading, isError: query.isError };
}
