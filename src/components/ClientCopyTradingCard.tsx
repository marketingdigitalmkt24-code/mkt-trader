import { useState, useEffect, useCallback } from 'react';
import { Wallet, Loader2, Power } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useIQOptionConnection } from '@/hooks/useIQOptionConnection';
import { useClientCopyResults } from '@/hooks/useClientCopyResults';
import { copyResultRates } from '@/lib/admin-copy-results';
import { cn } from '@/lib/utils';
import { canEnableCopy, readCopyAccount, readCopyEnabled } from '@/lib/client-copy-state';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export function ClientCopyTradingCard({ settingsOnly = false }: { settingsOnly?: boolean }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const { balance } = useIQOptionConnection({ silentMissingCredentials: true, fetchStatistics: false, balanceOnly: true });
  const results = useClientCopyResults();
  const { winPercent } = copyResultRates(results.wins, results.losses);
  const money = (value: number) => value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const [enabled, setEnabled] = useState(false);
  const [connected, setConnected] = useState(false);
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
      supabase.from('iqoption_config').select('is_active, last_connected_at').eq('user_id', user.id).eq('is_active', true).limit(1).maybeSingle(),
    ]);
    const isConnected = canEnableCopy(iqCfg);
    setConnected(isConnected);
    setEnabled(readCopyEnabled(copyCfg));
    if (settings) {
      setTradeAmount(String(settings.trade_amount ?? 1));
      setProfitTarget(String(settings.profit_target_value ?? 0));
    }
    setIsLoading(false);
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!user?.id) return;
    const refreshStatus = async () => {
      const [{ data: cfg }, { data: iq }] = await Promise.all([
        supabase.from('copy_trading_configs').select('enabled').eq('user_id', user.id).maybeSingle(),
        supabase.from('iqoption_config').select('is_active, last_connected_at').eq('user_id', user.id).eq('is_active', true).limit(1).maybeSingle(),
      ]);
      setEnabled(readCopyEnabled(cfg));
      setConnected(canEnableCopy(iq));
    };
    const channel = supabase.channel(`client-copy-status-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'copy_trading_configs', filter: `user_id=eq.${user.id}` }, refreshStatus)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'iqoption_config', filter: `user_id=eq.${user.id}` }, refreshStatus)
      .subscribe();
    const timer = setInterval(refreshStatus, 5000);
    return () => { clearInterval(timer); void supabase.removeChannel(channel); };
  }, [user?.id]);

  const save = async (patch?: { enabled?: boolean }) => {
    if (!user?.id) return;
    const nextEnabled = patch?.enabled ?? enabled;
    if (patch?.enabled === true && !connected) return;
    const amount = parseFloat(tradeAmount);
    const target = parseFloat(profitTarget);
    if (patch?.enabled !== false && (isNaN(amount) || amount <= 0 || !Number.isFinite(target) || target < 0)) {
      toast({ title: 'Valor inválido', description: 'Informe um valor de entrada maior que zero.', variant: 'destructive' });
      return;
    }
    setIsSaving(true);
    if (patch?.enabled === false) {
      const { error } = await supabase.from('copy_trading_configs').update({ enabled: false }).eq('user_id', user.id);
      setIsSaving(false);
      if (error) toast({ title: 'Erro ao desligar', variant: 'destructive' });
      else setEnabled(false);
      return;
    }
    const { data: iqConfig, error: iqError } = await supabase.from('iqoption_config')
      .select('account_type, is_active, last_connected_at')
      .eq('user_id', user.id).eq('is_active', true).limit(1).maybeSingle();
    const nextAccount = readCopyAccount(iqConfig);
    if (iqError || !canEnableCopy(iqConfig) || !nextAccount) {
      setIsSaving(false);
      toast({ title: 'Conecte sua conta IQ Option', description: 'Conecte a conta antes de salvar ou ligar o copy.', variant: 'destructive' });
      return;
    }
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
            <Wallet className="w-4 h-4 text-primary" />
          </div>
          {settingsOnly ? 'Configurações de Copy Trading' : 'Gestão de Banca IQ Option'}
          <Badge variant={enabled ? 'default' : 'secondary'} className="ml-auto text-xs">
            {enabled ? 'Ligado' : 'Desligado'}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!settingsOnly && <>
        <div className="border-b border-border pb-4">
          <div className="flex items-center justify-between gap-2 mb-1">
            <span className="text-sm text-muted-foreground">Saldo Atual</span>
            {balance && <Badge variant={balance.accountType === 'REAL' ? 'default' : 'secondary'}>{balance.accountType === 'REAL' ? 'REAL' : 'DEMO'}</Badge>}
          </div>
          <p className="text-2xl font-bold font-mono">{balance ? `${balance.currency === 'BRL' ? 'R$' : 'US$'} ${money(balance.balance)}` : '—'}</p>
        </div>
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase text-muted-foreground">Resultado de Hoje</p>
          <p className={cn('text-3xl font-bold font-mono text-center', results.profit < 0 ? 'text-put' : 'text-call')}>
            {results.isError ? 'Indisponível' : results.isLoading ? '…' : `${results.profit < 0 ? '−' : '+'}US$ ${money(Math.abs(results.profit))}`}
          </p>
          <div className="grid grid-cols-4 gap-2 text-center">
            <div><p className="font-mono font-bold text-call">{results.wins}</p><p className="text-[10px] text-muted-foreground">Wins</p></div>
            <div><p className="font-mono font-bold text-put">{results.losses}</p><p className="text-[10px] text-muted-foreground">Losses</p></div>
            <div><p className="font-mono font-bold">{results.trades}</p><p className="text-[10px] text-muted-foreground">Trades</p></div>
            <div><p className="font-mono font-bold text-gold">{winPercent.toFixed(1)}%</p><p className="text-[10px] text-muted-foreground">Win Rate</p></div>
          </div>
        </div>
        </>}
        {settingsOnly && <>
        {!connected && (
          <p className="text-xs text-muted-foreground">Conecte sua conta IQ Option para ligar o copy trading.</p>
        )}

        <div className="grid grid-cols-2 gap-3 border-t border-border pt-4">
          <div className="space-y-2">
            <Label htmlFor="copy-amount" className="text-sm">Valor de entrada ($)</Label>
            <Input
              id="copy-amount"
              type="number"
              min="1"
              step="0.5"
              value={tradeAmount}
              onChange={(e) => setTradeAmount(e.target.value)}
              disabled={isSaving || !connected}
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
              disabled={isSaving || !connected}
            />
          </div>
        </div>

        <Button variant="outline" onClick={() => save()} disabled={isSaving || !connected} className="w-full">
          {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
          Salvar configurações
        </Button>
        <div className="flex flex-col items-center gap-3 border-t border-border pt-4">
          <p role="status" className={`text-sm font-semibold ${enabled ? 'text-call' : 'text-muted-foreground'}`}>
            Copy trading {enabled ? 'ligado' : 'desligado'}
          </p>
          <Button onClick={() => save({ enabled: !enabled })} disabled={isSaving || (!enabled && !connected)} variant={enabled ? 'destructive' : 'default'} className="gap-2 min-w-40">
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Power className="w-4 h-4" />}
            {enabled ? 'Desligar copy' : 'Ligar copy'}
          </Button>
        </div>
        </>}
      </CardContent>
    </Card>
  );
}
