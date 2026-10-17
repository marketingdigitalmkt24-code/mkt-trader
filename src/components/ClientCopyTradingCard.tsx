import { useState, useEffect, useCallback } from 'react';
import { Copy, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export function ClientCopyTradingCard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [enabled, setEnabled] = useState(false);
  const [connected, setConnected] = useState(false);
  const [accountType, setAccountType] = useState<'PRACTICE' | 'REAL'>('PRACTICE');
  const [tradeAmount, setTradeAmount] = useState('1');
  const [profitTarget, setProfitTarget] = useState('0');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const load = useCallback(async () => {
    if (!user?.id) { setIsLoading(false); return; }
    setIsLoading(true);
    const [{ data: copyCfg }, { data: settings }, { data: iqCfg }] = await Promise.all([
      supabase.from('copy_trading_configs').select('enabled, account_type').eq('user_id', user.id).maybeSingle(),
      supabase.from('user_trading_settings').select('trade_amount, profit_target_value').eq('user_id', user.id).maybeSingle(),
      supabase.from('iqoption_config').select('is_active').eq('user_id', user.id).eq('is_active', true).limit(1).maybeSingle(),
    ]);
    const isConnected = !!iqCfg?.is_active;
    setConnected(isConnected);
    if (copyCfg) {
      setAccountType(copyCfg.account_type as 'PRACTICE' | 'REAL');
      // Ao entrar na dashboard o copy sempre começa desativado;
      // o cliente só pode ativar manualmente com a IQ Option conectada.
      if (copyCfg.enabled) {
        setEnabled(false);
        supabase.from('copy_trading_configs').upsert(
          { user_id: user.id, enabled: false, account_type: copyCfg.account_type },
          { onConflict: 'user_id' }
        );
      } else {
        setEnabled(false);
      }
    } else {
      setEnabled(false);
    }
    if (settings) {
      setTradeAmount(String(settings.trade_amount ?? 1));
      setProfitTarget(String(settings.profit_target_value ?? 0));
    }
    setIsLoading(false);
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);

  const save = async (patch?: { enabled?: boolean; account_type?: 'PRACTICE' | 'REAL' }) => {
    if (!user?.id) return;
    const nextEnabled = patch?.enabled ?? enabled;
    const nextAccount = patch?.account_type ?? accountType;
    const amount = parseFloat(tradeAmount);
    const target = parseFloat(profitTarget);
    if (isNaN(amount) || amount <= 0) {
      toast({ title: 'Valor inválido', description: 'Informe um valor de entrada maior que zero.', variant: 'destructive' });
      return;
    }
    setIsSaving(true);
    const [{ error: copyError }, { error: settingsError }] = await Promise.all([
      supabase.from('copy_trading_configs').upsert(
        { user_id: user.id, enabled: nextEnabled, account_type: nextAccount },
        { onConflict: 'user_id' }
      ),
      supabase.from('user_trading_settings').upsert(
        {
          user_id: user.id,
          trade_amount: amount,
          profit_target_type: target > 0 ? 'value' : 'none',
          profit_target_value: target > 0 ? target : 0,
        },
        { onConflict: 'user_id' }
      ),
    ]);
    setIsSaving(false);
    if (copyError || settingsError) {
      toast({ title: 'Erro ao salvar', description: 'Não foi possível salvar as configurações.', variant: 'destructive' });
      return;
    }
    setEnabled(nextEnabled);
    setAccountType(nextAccount);
    toast({ title: 'Salvo', description: 'Configurações de copy trading atualizadas.' });
  };

  if (isLoading) {
    return (
      <Card className="border-primary/20">
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <div className="w-7 h-7 rounded-lg bg-primary/20 flex items-center justify-center">
            <Copy className="w-4 h-4 text-primary" />
          </div>
          Copy Trading
          <Badge variant={enabled ? 'default' : 'secondary'} className="ml-auto text-xs">
            {enabled ? '🟢 Ativo' : '⏸️ Desativado'}
          </Badge>
        </CardTitle>
        <CardDescription>
          As operações da conta principal são copiadas automaticamente para a sua conta.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between p-3 bg-secondary/30 rounded-lg">
          <div>
            <p className="text-sm font-medium">Robô de cópia</p>
            <p className="text-xs text-muted-foreground">Ative para receber as operações copiadas</p>
          </div>
          <Switch
            checked={enabled}
            disabled={isSaving}
            onCheckedChange={(v) => save({ enabled: v })}
          />
        </div>

        <div className="space-y-2">
          <Label className="text-sm">Conta que recebe as operações</Label>
          <div className="flex rounded-lg overflow-hidden border border-border/50 w-full">
            <button
              disabled={isSaving}
              onClick={() => save({ account_type: 'PRACTICE' })}
              className={`flex-1 px-3 py-2 text-sm font-medium transition-colors ${accountType === 'PRACTICE' ? 'bg-primary text-primary-foreground' : 'bg-secondary/50 text-muted-foreground hover:bg-secondary'}`}
            >
              Demo (treino)
            </button>
            <button
              disabled={isSaving}
              onClick={() => save({ account_type: 'REAL' })}
              className={`flex-1 px-3 py-2 text-sm font-medium transition-colors ${accountType === 'REAL' ? 'bg-call text-call-foreground' : 'bg-secondary/50 text-muted-foreground hover:bg-secondary'}`}
            >
              Real
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="copy-amount" className="text-sm">Valor de entrada ($)</Label>
            <Input
              id="copy-amount"
              type="number"
              min="1"
              step="0.5"
              value={tradeAmount}
              onChange={(e) => setTradeAmount(e.target.value)}
              disabled={isSaving}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="copy-target" className="text-sm">Meta de lucro ($)</Label>
            <Input
              id="copy-target"
              type="number"
              min="0"
              step="1"
              value={profitTarget}
              onChange={(e) => setProfitTarget(e.target.value)}
              disabled={isSaving}
            />
          </div>
        </div>

        <Button onClick={() => save()} disabled={isSaving} className="w-full">
          {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
          Salvar configurações
        </Button>
      </CardContent>
    </Card>
  );
}
