import { useState, useEffect, useCallback } from 'react';
import { Copy, Loader2, UserCheck } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { readCopyAccount } from '@/lib/client-copy-state';

interface ClientProfile {
  id: string;
  user_id: string;
  email: string;
  is_active: boolean;
}

interface CopyConfig {
  user_id: string;
  enabled: boolean;
}

export function CopyTradingCard() {
  const [clients, setClients] = useState<ClientProfile[]>([]);
  const [configs, setConfigs] = useState<Record<string, CopyConfig>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [accounts, setAccounts] = useState<Record<string, 'PRACTICE' | 'REAL' | null>>({});

  const load = useCallback(async () => {
    setIsLoading(true);
    const [{ data: profiles }, { data: copyConfigs }, { data: iqConfigs }] = await Promise.all([
      supabase.from('client_profiles').select('*').order('created_at', { ascending: false }),
      supabase.from('copy_trading_configs').select('user_id, enabled'),
      supabase.from('iqoption_config').select('user_id, account_type').eq('is_active', true),
    ]);
    setClients(profiles || []);
    const map: Record<string, CopyConfig> = {};
    (copyConfigs || []).forEach((c) => {
      map[c.user_id] = { user_id: c.user_id, enabled: c.enabled };
    });
    setConfigs(map);
    const accountMap: Record<string, 'PRACTICE' | 'REAL' | null> = {};
    (iqConfigs || []).forEach(c => { accountMap[c.user_id] = readCopyAccount(c); });
    setAccounts(accountMap);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    void load();
    const channel = supabase.channel('admin-copy-readonly')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'iqoption_config' }, () => { void load(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'copy_trading_configs' }, () => { void load(); })
      .subscribe();
    const interval = setInterval(load, 10000);
    return () => { clearInterval(interval); void supabase.removeChannel(channel); };
  }, [load]);

  return (
    <Card className="border-primary/20">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Copy className="w-5 h-5 text-primary" />
          <CardTitle>Copy Trading</CardTitle>
        </div>
        <CardDescription>
          Contas e status do copy configurados pelos clientes.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : clients.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            Nenhum cliente cadastrado. Cadastre na aba Usuários.
          </p>
        ) : (
          clients.map((client) => {
            const cfg = configs[client.user_id];
            const enabled = cfg?.enabled ?? false;
            const accountType = accounts[client.user_id];
            return (
              <div key={client.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-secondary/20 rounded-lg">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                    <UserCheck className="w-4 h-4 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{client.email}</p>
                    <p className="text-xs text-muted-foreground">
                      {accountType ? `Conta ${accountType === 'REAL' ? 'Real' : 'Demo'}` : 'Conta não conectada'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant={enabled ? 'default' : 'secondary'}>
                    {enabled ? 'Copy Ativo' : 'Inativo'}
                  </Badge>
                </div>
              </div>
            );
          })
        )}
        <p className="text-xs text-muted-foreground pt-2">
          A conta e a ativação do copy são alteradas somente pelo cliente na área dele.
        </p>
      </CardContent>
    </Card>
  );
}
