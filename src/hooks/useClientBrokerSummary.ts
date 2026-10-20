import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { canEnableCopy, readCopyAccount } from '@/lib/client-copy-state';
import { useToast } from '@/hooks/use-toast';
import { useState } from 'react';

export function useClientBrokerSummary() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const load = async () => {
    if (!user) return null;
    const [iq, copy, settings] = await Promise.all([
      supabase.from('iqoption_config').select('email, account_type, is_active, last_connected_at').eq('user_id', user.id).order('updated_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('copy_trading_configs').select('enabled').eq('user_id', user.id).maybeSingle(),
      supabase.from('user_trading_settings').select('trade_amount, profit_target_value').eq('user_id', user.id).maybeSingle(),
    ]);
    if (iq.error || copy.error || settings.error) throw new Error('Não foi possível verificar a conta.');
    return { iq: iq.data, enabled: copy.data?.enabled === true, settings: settings.data };
  };
  const query = useQuery({ queryKey: ['client-broker-summary', user?.id], enabled: Boolean(user), queryFn: load, refetchInterval: 5000 });
  const configured = canEnableCopy(query.data?.iq) && Boolean(readCopyAccount(query.data?.iq)) && Number(query.data?.settings?.trade_amount) > 0;
  const toggle = async () => {
    if (!user || saving) return;
    setSaving(true);
    try {
      const current = await load();
      const next = !current?.enabled;
      const account = readCopyAccount(current?.iq);
      if (next && (!canEnableCopy(current?.iq) || !account || !(Number(current?.settings?.trade_amount) > 0))) throw new Error('Configure e conecte sua conta na aba Corretoras antes de ligar o copy.');
      const result = next
        ? await supabase.from('copy_trading_configs').upsert({ user_id: user.id, enabled: true, account_type: account ?? '' }, { onConflict: 'user_id' })
        : await supabase.from('copy_trading_configs').update({ enabled: false }).eq('user_id', user.id);
      if (result.error) throw result.error;
      await queryClient.invalidateQueries({ queryKey: ['client-broker-summary', user.id] });
      toast({ title: next ? 'Copy ligado' : 'Copy desligado' });
    } catch (error) {
      toast({ title: 'Não foi possível alterar o copy', description: error instanceof Error ? error.message : 'Tente novamente.', variant: 'destructive' });
    } finally { setSaving(false); }
  };
  return { ...query, configured, saving, toggle };
}