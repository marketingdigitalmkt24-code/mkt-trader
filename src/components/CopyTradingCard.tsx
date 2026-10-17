import { useState, useEffect, useCallback } from 'react';
import { Copy, Loader2, UserCheck } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface ClientProfile {
  id: string;
  user_id: string;
  email: string;
  is_active: boolean;
}

interface CopyConfig {
  user_id: string;
  enabled: boolean;
  account_type: 'PRACTICE' | 'REAL';
}

export function CopyTradingCard() {
  const { toast } = useToast();
  const [clients, setClients] = useState<ClientProfile[]>([]);
  const [configs, setConfigs] = useState<Record<string, CopyConfig>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [savingUserId, setSavingUserId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    const [{ data: profiles }, { data: copyConfigs }] = await Promise.all([
      supabase.from('client_profiles').select('*').order('created_at', { ascending: false }),
      supabase.from('copy_trading_configs').select('user_id, enabled, account_type'),
    ]);
    setClients(profiles || []);
    const map: Record<string, CopyConfig> = {};
    (copyConfigs || []).forEach((c) => {
      map[c.user_id] = { user_id: c.user_id, enabled: c.enabled, account_type: c.account_type as 'PRACTICE' | 'REAL' };
    });
    setConfigs(map);
    setIsLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const saveConfig = async (userId: string, patch: Partial<CopyConfig>) => {
    const current = configs[userId] || { user_id: userId, enabled: false, account_type: 'PRACTICE' as const };
    const next = { ...current, ...patch };
    setSavingUserId(userId);
    const { error } = await supabase
      .from('copy_trading_configs')
      .upsert({ user_id: userId, enabled: next.enabled, account_type: next.account_type }, { onConflict: 'user_id' });
    setSavingUserId(null);
    if (error) {
      toast({ title: 'Erro ao salvar', description: 'Não foi possível salvar a configuração de copy trading.', variant: 'destructive' });
      return;
    }
    setConfigs((prev) => ({ ...prev, [userId]: next }));
  };

  return (
    <Card className="border-primary/20">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Copy className="w-5 h-5 text-primary" />
          <CardTitle>Copy Trading</CardTitle>
        </div>
        <CardDescription>
          Tudo que for operado na sua conta principal será copiado para os clientes ativados abaixo, na conta Demo ou Real escolhida.
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
            const accountType = cfg?.account_type ?? 'PRACTICE';
            const saving = savingUserId === client.user_id;
            return (
              <div key={client.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-secondary/20 rounded-lg">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                    <UserCheck className="w-4 h-4 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{client.email}</p>
                    <p className="text-xs text-muted-foreground">
                      {enabled ? `Copiando em conta ${accountType === 'REAL' ? 'Real' : 'Demo'}` : 'Copy desativado'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <div className="flex rounded-lg overflow-hidden border border-border/50">
                    <button
                      disabled={saving}
                      onClick={() => saveConfig(client.user_id, { account_type: 'PRACTICE' })}
                      className={`px-3 py-1.5 text-xs font-medium transition-colors ${accountType === 'PRACTICE' ? 'bg-primary text-primary-foreground' : 'bg-secondary/50 text-muted-foreground hover:bg-secondary'}`}
                    >
                      Demo
                    </button>
                    <button
                      disabled={saving}
                      onClick={() => saveConfig(client.user_id, { account_type: 'REAL' })}
                      className={`px-3 py-1.5 text-xs font-medium transition-colors ${accountType === 'REAL' ? 'bg-call text-call-foreground' : 'bg-secondary/50 text-muted-foreground hover:bg-secondary'}`}
                    >
                      Real
                    </button>
                  </div>
                  <Badge
                    variant={enabled ? 'default' : 'secondary'}
                    className="cursor-pointer"
                    onClick={() => !saving && saveConfig(client.user_id, { enabled: !enabled })}
                  >
                    {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : enabled ? 'Copy Ativo' : 'Inativo'}
                  </Badge>
                </div>
              </div>
            );
          })
        )}
        <p className="text-xs text-muted-foreground pt-2">
          O cliente precisa ter as credenciais da IQ Option salvas na área dele para receber as operações copiadas.
        </p>
      </CardContent>
    </Card>
  );
}
