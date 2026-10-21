import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

// Corte global de reset da exibição IQ (tabela iq_display_reset, linha única).
// Aplicado junto com o corte por usuário para zerar entradas em admin e cliente.
export function useGlobalIQResetCutoff() {
  const query = useQuery({
    queryKey: ['iq-display-reset'],
    refetchInterval: 15000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('iq_display_reset')
        .select('cutoff')
        .eq('id', 1)
        .maybeSingle();
      if (error) throw error;
      return (data?.cutoff as string | null) ?? '';
    },
  });
  return query.data ?? '';
}
