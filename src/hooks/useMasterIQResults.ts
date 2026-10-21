import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { historyStart } from '@/components/dayLabel';
import { combineCutoffs, getIQResultsReset, IQ_RESULTS_RESET_EVENT } from '@/lib/iq-results-reset';
import { useGlobalIQResetCutoff } from '@/hooks/useGlobalIQResetCutoff';
import { isMasterIQOrder, masterIQDailyStats, type MasterIQOperation } from '@/lib/master-iq-results';

export function useMasterIQResults() {
  const { user } = useAuth();
  const userId = user?.id;
  const queryClient = useQueryClient();
  const [cutoff, setCutoff] = useState(() => getIQResultsReset(userId));
  const query = useQuery({
    queryKey: ['master-iq-results', userId], enabled: Boolean(userId), refetchInterval: 10000,
    queryFn: async () => {
      const rows: MasterIQOperation[] = [];
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await supabase.from('operation_results')
          .select('id, signal_id, asset, direction, result, profit, created_at, timeframe, entry_strategy, iq_option_id')
          .not('signal_id', 'like', 'copy-%').not('signal_id', 'like', 'mt5-%')
          .not('timeframe', 'in', '(TEST,MT5)').not('iq_option_id', 'is', null)
          .gte('created_at', historyStart()).order('created_at', { ascending: false })
          .order('id', { ascending: false }).range(offset, offset + 999);
        if (error) throw error;
        rows.push(...(data || []));
        if (!data || data.length < 1000) return rows;
      }
    },
  });
  useEffect(() => {
    setCutoff(getIQResultsReset(userId));
    const reload = () => { setCutoff(getIQResultsReset(userId)); void queryClient.invalidateQueries({ queryKey: ['master-iq-results', userId] }); };
    window.addEventListener(IQ_RESULTS_RESET_EVENT, reload);
    const channel = supabase.channel(`master-iq-results-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'operation_results' }, reload).subscribe();
    return () => { window.removeEventListener(IQ_RESULTS_RESET_EVENT, reload); void supabase.removeChannel(channel); };
  }, [userId, queryClient]);
  const operations = useMemo(() => (query.data || []).filter(row => isMasterIQOrder(row, cutoff)), [query.data, cutoff]);
  return { operations, dailyStats: masterIQDailyStats(operations, cutoff), isError: query.isError };
}