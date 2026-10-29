import { useEffect, useState } from 'react';
import { Wallet } from 'lucide-react';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { iqOptionClient } from '@/services/IQOptionClient';

// Account that receives the IQ Option entries. Changing it invalidates the connection (reconnect required).
export function AutoTradingAccountSelect() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [config, setConfig] = useState<{ id: string; account_type: string; is_active: boolean } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase.from('iqoption_config').select('id, account_type, is_active').eq('user_id', user.id)
      .order('updated_at', { ascending: false }).limit(1).maybeSingle()
      .then(({ data }) => setConfig(data));
  }, [user]);

  const change = async (next: string) => {
    if (!user || !config || next === config.account_type) return;
    setSaving(true);
    const { data, error } = await supabase.from('iqoption_config')
      .update({ account_type: next, is_active: false, last_connected_at: null })
      .eq('id', config.id).eq('user_id', user.id).select('id, account_type, is_active').single();
    setSaving(false);
    if (error) { toast({ title: 'Não foi possível trocar a conta', variant: 'destructive' }); return; }
    iqOptionClient.disconnect();
    setConfig(data);
    toast({ title: `Conta ${next === 'REAL' ? 'Real' : 'Demo'} selecionada`, description: 'Reconecte a IQ Option nas configurações para voltar a enviar entradas.' });
  };

  return (
    <div className="space-y-2">
      <Label className="flex items-center gap-2"><Wallet className="w-4 h-4 text-primary" />Conta das entradas IQ Option</Label>
      {config ? (
        <>
          <Select value={config.account_type} onValueChange={change} disabled={saving}>
            <SelectTrigger className="w-full sm:w-56"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="PRACTICE">Demo (treinamento)</SelectItem>
              <SelectItem value="REAL">Real</SelectItem>
            </SelectContent>
          </Select>
          {!config.is_active && <p className="text-xs text-muted-foreground">Conexão desligada — reconecte a IQ Option para enviar entradas.</p>}
        </>
      ) : <p className="text-xs text-muted-foreground">Conecte a IQ Option nas configurações primeiro.</p>}
    </div>
  );
}
