import { DailyHistory } from './DailyHistory';
import { Wallet, TrendingUp, TrendingDown, AlertTriangle, Target, Activity, RefreshCw, Loader2, Calendar, RotateCcw, WalletCards } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Progress } from '@/components/ui/progress';
import { useIQOptionConnection } from '@/hooks/useIQOptionConnection';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { resetIQResults } from '@/lib/iq-results-reset';
import { useMasterIQResults } from '@/hooks/useMasterIQResults';

export function BankManagementCard() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [isRefilling, setIsRefilling] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const {
    balance,
    isLoading,
    lastUpdate,
    refreshBalance,
  } = useIQOptionConnection({ fetchStatistics: false, balanceOnly: true });
  const { dailyStats, isError: resultsError } = useMasterIQResults();

  // Use REAL stats from IQ Option API (not simulated)
  const wins = dailyStats.wins;
  const losses = dailyStats.losses;
  const trades = dailyStats.todayTrades;
  const profit = dailyStats.dailyProfit;
  const consecutiveLosses = dailyStats.consecutiveLosses;
  
  // Calculate win rate from real data
  const totalDecided = wins + losses;
  const winRate = totalDecided > 0 ? (wins / totalDecided) * 100 : 0;
  
  const currency = balance?.currency || 'USD';
  const accountType = balance?.accountType || 'PRACTICE';
  const currentBalance = balance?.balance ?? 0;

  const maxDailyTrades = 20;
  const riskPerTrade = 2;
  const suggestedBet = (currentBalance * riskPerTrade) / 100;
  const tradeProgress = (trades / maxDailyTrades) * 100;
  const isOvertrading = trades >= maxDailyTrades * 0.8;
  const hasConsecutiveLosses = consecutiveLosses >= 2;

  const handleRefresh = async () => {
    if (refreshBalance) {
      await refreshBalance();
    }
  };

  const handleReset = async () => {
    if (!user) return;
    setIsResetting(true);
    try {
      resetIQResults(user.id);
      toast({ title: 'Resultados zerados', description: 'Entradas na IQ Option e Resultado de Hoje zerados neste navegador. Operações em Tempo Real preservadas.' });
    } catch (error) {
      console.error('Error resetting stats:', error);
      toast({ title: 'Erro', description: 'Não foi possível resetar.', variant: 'destructive' });
    } finally {
      setIsResetting(false);
    }
  };

  const handleRefill = async () => {
    if (balance?.accountType !== 'PRACTICE' || isRefilling) return;
    setIsRefilling(true);
    try {
      const { data, error } = await supabase.functions.invoke('iqoption-refill-demo', { body: {} });
      if (error || !data?.success) throw new Error(data?.error || 'A IQ Option não confirmou a recarga demo.');
      await refreshBalance();
      toast({ title: 'Conta demo recarregada', description: 'Saldo confirmado pela IQ Option: 10.000.' });
    } catch (error) {
      toast({ title: 'Recarga não confirmada', description: error instanceof Error ? error.message : 'Tente novamente.', variant: 'destructive' });
    } finally { setIsRefilling(false); }
  };

  const formatCurrency = (value: number) => {
    if (currency === 'BRL') {
      return `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
    }
    return `$ ${value.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
  };

  return (
    <section className="glass-card p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Wallet className="w-5 h-5 text-primary" />
          <h3 className="font-semibold text-foreground">Gestão de Banca IQ Option</h3>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs px-2 py-0.5 rounded-full bg-primary/20 text-primary">IQ</span>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={handleRefresh}
                  aria-label="Atualizar saldo"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <RefreshCw className="w-4 h-4 text-muted-foreground hover:text-primary" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Atualizar saldo</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          {balance?.accountType === 'PRACTICE' && (
            <TooltipProvider><Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-6 w-6" aria-label="Recarregar conta demo para 10.000" onClick={handleRefill} disabled={isRefilling}>
                  {isRefilling ? <Loader2 className="w-4 h-4 animate-spin" /> : <WalletCards className="w-4 h-4 text-primary" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>Recarregar demo para 10.000</TooltipContent>
            </Tooltip></TooltipProvider>
          )}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={handleReset}
                  aria-label="Resetar resultados"
                  disabled={isResetting}
                >
                  {isResetting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <RotateCcw className="w-4 h-4 text-muted-foreground hover:text-put" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Resetar resultados</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      {/* Balance Header */}
      <div className="bg-secondary/50 rounded-xl p-4 mb-4">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Saldo Atual</span>
            {balance && (
              <Badge
                variant={accountType === 'REAL' ? 'default' : 'secondary'}
                className={cn(
                  'text-[9px] px-1.5 py-0 h-4 font-bold',
                  accountType === 'REAL' && 'bg-call/20 text-call border-call/30'
                )}
              >
                {accountType === 'REAL' ? 'REAL' : 'DEMO'}
              </Badge>
            )}
          </div>
          {lastUpdate && (
            <span className="text-[10px] text-muted-foreground">
              {lastUpdate.toLocaleTimeString('pt-BR')}
            </span>
          )}
        </div>
        <div className="text-2xl font-bold font-mono text-foreground">
          {balance ? formatCurrency(currentBalance) : 'Saldo não confirmado'}
        </div>
      </div>

      {/* Today's Performance Card */}
      <div className={cn(
        "rounded-xl p-4 mb-4 border",
        profit >= 0 
          ? "bg-call/5 border-call/20" 
          : "bg-put/5 border-put/20"
      )}>
        <div className="flex items-center gap-2 mb-3">
          <Calendar className="w-4 h-4 text-muted-foreground" />
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Resultado de Hoje</span>
        </div>

        {resultsError && <p className="text-xs text-destructive mb-2">Não foi possível atualizar os resultados.</p>}
        {/* Main P&L */}
        <div className="flex items-center justify-center gap-3 mb-4">
          <div className={cn(
            "w-10 h-10 rounded-full flex items-center justify-center",
            profit >= 0 ? "bg-call/20" : "bg-put/20"
          )}>
            {profit >= 0 ? (
              <TrendingUp className="w-5 h-5 text-call" />
            ) : (
              <TrendingDown className="w-5 h-5 text-put" />
            )}
          </div>
          <span className={cn(
            "text-3xl font-bold font-mono",
            profit >= 0 ? "text-call" : "text-put"
          )}>
            {profit >= 0 ? '+' : ''}{formatCurrency(profit)}
          </span>
        </div>

        {/* Win Rate Bar */}
        <div className="mb-4">
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span className="text-muted-foreground font-medium">Win Rate</span>
            <span className={cn(
              'font-bold font-mono text-sm',
              winRate >= 60 ? 'text-call' : winRate >= 50 ? 'text-gold' : 'text-put'
            )}>
              {winRate.toFixed(1)}%
            </span>
          </div>
          <div className="relative h-3 bg-secondary/80 rounded-full overflow-hidden">
            <div 
              className={cn(
                "h-full rounded-full transition-all duration-500",
                winRate >= 60 ? 'bg-call' : winRate >= 50 ? 'bg-gold' : 'bg-put'
              )}
              style={{ width: `${Math.min(winRate, 100)}%` }}
            />
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-4 gap-1.5">
          <div className="bg-call/10 rounded-lg p-2 text-center">
            <div className="text-lg font-bold font-mono text-call leading-tight">{wins}</div>
            <div className="text-[9px] uppercase tracking-widest text-call/60 font-bold mt-0.5">Wins</div>
          </div>
          <div className="bg-put/10 rounded-lg p-2 text-center">
            <div className="text-lg font-bold font-mono text-put leading-tight">{losses}</div>
            <div className="text-[9px] uppercase tracking-widest text-put/60 font-bold mt-0.5">Losses</div>
          </div>
          <div className="bg-secondary/60 rounded-lg p-2 text-center">
            <div className={cn('text-lg font-bold font-mono leading-tight', isOvertrading ? 'text-gold' : 'text-foreground')}>
              {trades}
            </div>
            <div className="text-[9px] uppercase tracking-widest text-muted-foreground font-bold mt-0.5">Trades</div>
          </div>
          <div className="bg-secondary/60 rounded-lg p-2 text-center">
            <div className="text-lg font-bold font-mono text-primary leading-tight">{riskPerTrade}%</div>
            <div className="text-[9px] uppercase tracking-widest text-muted-foreground font-bold mt-0.5">Risco</div>
          </div>
        </div>

        {/* Trade Limit Progress */}
        <div className="mt-3 pt-3 border-t border-border/30">
          <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
            <span>Limite diário</span>
            <span className="font-mono">{trades}/{maxDailyTrades}</span>
          </div>
          <Progress
            value={tradeProgress}
            className={cn('h-1.5', isOvertrading && '[&>div]:bg-gold')}
          />
        </div>
      </div>

      {/* Alerts */}
      {(isOvertrading || hasConsecutiveLosses) && (
        <div className="space-y-2">
          {isOvertrading && (
            <div className="flex items-center gap-2 p-2 bg-gold/10 border border-gold/20 rounded-lg">
              <AlertTriangle className="w-4 h-4 text-gold flex-shrink-0" />
              <span className="text-xs text-gold">
                Atenção: Limite de operações próximo
              </span>
            </div>
          )}
          {hasConsecutiveLosses && (
            <div className="flex items-center gap-2 p-2 bg-put/10 border border-put/20 rounded-lg">
              <AlertTriangle className="w-4 h-4 text-put flex-shrink-0" />
              <span className="text-xs text-put">
                {consecutiveLosses} perdas consecutivas - Considere pausar
              </span>
            </div>
          )}
        </div>
      )}

      {/* Daily History */}
      <DailyHistory title="Histórico Diário IQ Option" excludeTimeframe="MT5" perPage={5} />
    </section>
  );
}
