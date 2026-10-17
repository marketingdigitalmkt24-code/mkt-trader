import { useState, useEffect, useCallback } from 'react';
import { Copy, Loader2, UserCheck } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { readCopyAccount } from '@/lib/client-copy-state';
import { countClientCopyResults, copyResultRates } from '@/lib/admin-copy-results';
import { copyDayStart } from '../../supabase/functions/_shared/copy-target';

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
  const [results, setResults] = useState<Record<string, { wins: number; losses: number; profit: number }>>({});
  const [balances, setBalances] = useState<Record<string, { amount: number; currency: string; account: string } | null>>({});
  const [balancesLoading, setBalancesLoading] = useState(false);

  const load = useCallback(async () => {
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
    const totals = await Promise.all((profiles || []).map(async client => {
      let wins = 0;
      let losses = 0;
      let profit = 0;
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await supabase.from('operation_results')
          .select('signal_id, result, iq_option_id, timeframe, profit')
          .like('signal_id', `copy-${client.user_id}-%`)
          .gte('created_at', copyDayStart())
          .order('created_at').order('id')
          .range(offset, offset + 999);
        if (error) return [client.user_id, null] as const;
        const counts = countClientCopyResults(data || [], client.user_id);
        wins += counts.wins;
        losses += counts.losses;
        profit += counts.profit;
        if (!data || data.length < 1000) break;
      }
      return [client.user_id, { wins, losses, profit }] as const;
    }));
    setResults(Object.fromEntries(totals.filter(([, value]) => value !== null)));
  }, []);

  const connectedAccounts = JSON.stringify(Object.entries(accounts).filter(([, account]) => account).sort());
  useEffect(() => {
    let disposed = false;
    let running = false;
    const refresh = async () => {
      if (running) return;
      running = true;
      setBalancesLoading(true);
      const entries: [string, string][] = JSON.parse(connectedAccounts);
      const values = await Promise.all(entries.map(async ([userId, account]) => {
        try {
          const { data, error } = await supabase.functions.invoke('iqoption-get-balance', {
            body: { userId, timezoneOffset: 180 },
          });
          return [userId, !error && data?.success && Number.isFinite(data.balance) && data.accountType === account
            ? { amount: data.balance as number, currency: (data.currency || 'USD') as string, account }
            : null] as const;
        } catch {
          return [userId, null] as const;
        }
      }));
      if (!disposed) {
        setBalances(Object.fromEntries(values));
        setBalancesLoading(false);
      }
      running = false;
    };
    void refresh();
    const interval = setInterval(refresh, 60000);
    return () => { disposed = true; clearInterval(interval); };
  }, [connectedAccounts]);

  useEffect(() => {
    void load();
    const channel = supabase.channel('admin-copy-readonly')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'iqoption_config' }, () => { void load(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'copy_trading_configs' }, () => { void load(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'operation_results' }, () => { void load(); })
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
          Contas, saldo e resultados de hoje dos clientes.
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
            const balance = balances[client.user_id];
            const totals = results[client.user_id];
            const rates = totals ? copyResultRates(totals.wins, totals.losses) : null;
            return (
              <div key={client.id} className="flex flex-col lg:flex-row lg:flex-wrap lg:items-center justify-between gap-3 p-3 bg-secondary/20 rounded-lg">
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
                <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4 lg:ml-auto text-center">
                  <div>
                    <dt className="text-xs text-muted-foreground">Saldo</dt>
                    <dd className="text-sm font-semibold tabular-nums">
                      {balance && balance.account === accountType
                        ? `${balance.currency} ${balance.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                        : balancesLoading && accountType ? 'Consultando…' : 'Indisponível'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Lucro hoje</dt>
                    <dd className={`text-sm font-semibold tabular-nums ${totals && totals.profit < 0 ? 'text-put' : totals && totals.profit > 0 ? 'text-call' : 'text-foreground'}`}>
                      {totals ? `${balance?.currency || 'USD'} ${totals.profit > 0 ? '+' : ''}${totals.profit.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Win hoje</dt>
                    <dd className="text-sm font-semibold tabular-nums text-call">{totals?.wins ?? '—'}</dd>
                    <dd className="text-xs tabular-nums text-call">{rates ? `${rates.winPercent.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%` : '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Loss hoje</dt>
                    <dd className="text-sm font-semibold tabular-nums text-put">{totals?.losses ?? '—'}</dd>
                    <dd className="text-xs tabular-nums text-put">{rates ? `${rates.lossPercent.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%` : '—'}</dd>
                  </div>
                </dl>
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
