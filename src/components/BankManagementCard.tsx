import { Wallet, TrendingUp, TrendingDown, AlertTriangle, Target, Activity, RefreshCw, Loader2, Calendar, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Progress } from '@/components/ui/progress';
import { useIQOptionConnection } from '@/hooks/useIQOptionConnection';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useState } from 'react';

export function BankManagementCard() {
  const { toast } = useToast();
  const [isResetting, setIsResetting] = useState(false);
  const {
    balance,
    dailyStats,
    isLoading,
    lastUpdate,
    refreshBalance,
  } = useIQOptionConnection();

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
  const currentBalance = balance?.balance || 0;

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
    setIsResetting(true);
    try {
      const now = new Date();
      const todayUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));

      // Delete ALL today's results (IQ Option + MT5)
      const { data: results } = await supabase
        .from('operation_results')
        .select('id')
        .gte('created_at', todayUTC.toISOString());

      if (results && results.length > 0) {
        for (const r of results) {
          await supabase.from('operation_results').delete().eq('id', r.id);
        }
      }

      toast({ title: 'Resultados resetados', description: 'IQ Option e MT5 zerados com sucesso.' });
    } catch (error) {
      console.error('Error resetting stats:', error);
      toast({ title: 'Erro', description: 'Não foi possível resetar.', variant: 'destructive' });
    } finally {
      setIsResetting(false);
    }
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
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={handleReset}
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

      {/* Balance */}
      <div className="bg-secondary/50 rounded-xl p-4 mb-4">
        <div className="text-sm text-muted-foreground mb-1">Saldo Atual</div>
        <div className="text-2xl font-bold font-mono text-foreground">
          {formatCurrency(currentBalance)}
        </div>
        
        {/* Stats label - Today only */}
        <div className="flex items-center justify-center gap-1 mt-3 mb-2">
          <Calendar className="w-4 h-4 text-muted-foreground mr-1" />
          <span className="text-xs text-muted-foreground">Estatísticas de Hoje</span>
        </div>
        
        {/* Profit/Loss indicator */}
        <div className={cn(
          "p-2 rounded-lg flex items-center justify-center gap-2",
          profit >= 0 
            ? "bg-call/20 border border-call/30" 
            : "bg-put/20 border border-put/30"
        )}>
          {profit >= 0 ? (
            <>
              <TrendingUp className="w-5 h-5 text-call" />
              <span className="text-lg font-bold text-call">
                +{formatCurrency(profit)}
              </span>
              <span className="text-sm text-call/80">hoje</span>
            </>
          ) : (
            <>
              <TrendingDown className="w-5 h-5 text-put" />
              <span className="text-lg font-bold text-put">
                {formatCurrency(profit)}
              </span>
              <span className="text-sm text-put/80">hoje</span>
            </>
          )}
        </div>
        
        {lastUpdate && (
          <div className="text-xs text-muted-foreground mt-2 text-center">
            Atualizado: {lastUpdate.toLocaleTimeString('pt-BR')}
          </div>
        )}
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-secondary/50 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-1">
            <Target className="w-4 h-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Risco/Trade</span>
          </div>
          <div className="font-mono font-bold text-call">{riskPerTrade}%</div>
          <div className="text-xs text-muted-foreground">
            {formatCurrency(suggestedBet)}
          </div>
        </div>

        <div className="bg-secondary/50 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-1">
            <Activity className="w-4 h-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Trades (Hoje)</span>
          </div>
          <div className={cn('font-mono font-bold', isOvertrading ? 'text-gold' : 'text-foreground')}>
            {trades}/{maxDailyTrades}
          </div>
        </div>
      </div>

      {/* Win/Loss Stats */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className="bg-call/10 rounded-lg p-2 text-center">
          <div className="text-lg font-bold text-call">{wins}</div>
          <div className="text-xs text-muted-foreground">Wins</div>
        </div>
        <div className="bg-put/10 rounded-lg p-2 text-center">
          <div className="text-lg font-bold text-put">{losses}</div>
          <div className="text-xs text-muted-foreground">Losses</div>
        </div>
        <div className="bg-primary/10 rounded-lg p-2 text-center">
          <div className="text-lg font-bold text-primary">{winRate.toFixed(1)}%</div>
          <div className="text-xs text-muted-foreground">Win Rate</div>
        </div>
      </div>

      {/* Trade Progress */}
      <div className="mb-4">
        <div className="flex justify-between text-xs text-muted-foreground mb-2">
          <span>Progresso Diário</span>
          <span>{tradeProgress.toFixed(0)}%</span>
        </div>
        <Progress
          value={tradeProgress}
          className={cn('h-2', isOvertrading && '[&>div]:bg-gold')}
        />
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
    </section>
  );
}
