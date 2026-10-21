import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import type { ClientCopyOperation } from '@/lib/client-copy-results';
import { historyStart } from '@/components/dayLabel';
import { useMasterIQResults } from '@/hooks/useMasterIQResults';

const EXCLUDED_STRATEGIES = new Set(['FORCE_LOSS_WIN', 'FORCA_INVERTIDA', 'VELA_FORCA', 'RECUO_EMA21']);

// Histórico diário do cliente: mesmas entradas reais do principal (como no card "Entradas na IQ Option"),
// mas quando o cliente copiou a entrada, o resultado exibido é o da cópia dele, com o valor de entrada do cliente.
export function useClientCopyHistory() {
  const { user } = useAuth();
  const userId = user?.id;
  const master = useMasterIQResults();
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
          .or('entry_strategy.is.null,entry_strategy.not.in.(FORCE_LOSS_WIN,VELA_FORCA,RECUO_EMA21)')
          .not('signal_id', 'like', '%force-lw-%')
          .not('signal_id', 'like', '%forca_invertida-%')
          .not('signal_id', 'like', '%vela_forca-%')
          .gte('created_at', historyStart())
          .order('created_at', { ascending: false }).order('id', { ascending: false })
          .range(offset, offset + 999);
        if (error) throw error;
        rows.push(...(data || []));
        if (!data || data.length < 1000) return rows;
      }
    },
  });

  const operations = useMemo(() => {
    const prefix = `copy-${userId}-`;
    const copies = (query.data || []).filter(op => op.signal_id.startsWith(prefix));
    const copiedSignals = new Set(copies.map(op => op.signal_id.slice(prefix.length)));
    const masterRows: ClientCopyOperation[] = master.operations
      .filter(op => !copiedSignals.has(op.signal_id))
      .filter(op => !op.entry_strategy || !EXCLUDED_STRATEGIES.has(op.entry_strategy))
      .map(op => ({
        id: op.id,
        signal_id: op.signal_id,
        asset: op.asset,
        direction: op.direction,
        result: op.result,
        profit: op.profit,
        created_at: op.created_at,
        iq_option_id: op.iq_option_id,
        timeframe: op.timeframe,
        entry_strategy: op.entry_strategy,
      }));
    return [...copies, ...masterRows];
  }, [query.data, master.operations, userId]);

  return { operations, isLoading: query.isLoading, isError: query.isError || master.isError };
}
