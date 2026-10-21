import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { clientCopyResults, clientDayStart, type ClientCopyOperation } from '@/lib/client-copy-results';
import { afterIQReset, combineCutoffs, getIQResultsReset } from '@/lib/iq-results-reset';
import { useGlobalIQResetCutoff } from '@/hooks/useGlobalIQResetCutoff';

export function useClientCopyResults() {
  const { user } = useAuth();
  const userId = user?.id;
  const globalCutoff = useGlobalIQResetCutoff();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['client-copy-results', userId],
    enabled: Boolean(userId),
    refetchInterval: 10000,
    queryFn: async () => {
      if (!userId) return [];
      const rows: ClientCopyOperation[] = [];
      const start = clientDayStart();
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await supabase.from('operation_results')
          .select('id, signal_id, asset, direction, result, profit, created_at, iq_option_id, timeframe, entry_strategy')
          .like('signal_id', `copy-${userId}-%`)
          .not('iq_option_id', 'is', null)
          .not('timeframe', 'in', '(TEST,MT5)')
          .gte('created_at', start)
          .order('created_at', { ascending: false }).order('id', { ascending: false })
          .range(offset, offset + 999);
        if (error) throw error;
        rows.push(...(data || []));
        if (!data || data.length < 1000) return rows;
      }
    },
  });

  useEffect(() => {
    if (!userId) return;
    const channel = supabase.channel(`client-copy-results-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'operation_results' }, payload => {
        const row = payload.new as { signal_id?: string };
        if (row.signal_id?.startsWith(`copy-${userId}-`)) {
          void queryClient.invalidateQueries({ queryKey: ['client-copy-results', userId] });
          void queryClient.invalidateQueries({ queryKey: ['client-copy-history', userId] });
        }
      }).subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [userId, queryClient]);

  const cutoff = combineCutoffs(getIQResultsReset(userId), globalCutoff);
  return { ...clientCopyResults((query.data || []).filter(row => afterIQReset(row.created_at, cutoff)), userId || ''), isLoading: query.isLoading, isError: query.isError };
}