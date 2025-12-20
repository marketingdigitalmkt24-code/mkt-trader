import { Wallet, TrendingUp, TrendingDown, AlertTriangle, Target, Activity, RefreshCw, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Progress } from '@/components/ui/progress';
import { useIQOptionBalance } from '@/hooks/useIQOptionBalance';
import { Button } from '@/components/ui/button';

export function BankManagementCard() {
  const {
    balance,
    currency,
    accountType,
    dailyProfit,
    todayTrades,
    wins,
    losses,
    consecutiveLosses,
    isLoading,
    lastUpdate,
    refresh,
  } = useIQOptionBalance();

  const maxDailyTrades = 20;
  const riskPerTrade = 2;
  const suggestedBet = (balance * riskPerTrade) / 100;
  const tradeProgress = (todayTrades / maxDailyTrades) * 100;
  const isOvertrading = todayTrades >= maxDailyTrades * 0.8;
  const hasConsecutiveLosses = consecutiveLosses >= 2;
  const winRate = todayTrades > 0 ? ((wins / todayTrades) * 100).toFixed(1) : '0.0';

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
          <h3 className="font-semibold text-foreground">Gestão de Banca</h3>
        </div>
        <div className="flex items-center gap-2">
          <span className={cn(
            "text-xs px-2 py-0.5 rounded-full",
            accountType === 'PRACTICE' 
              ? "bg-blue-500/20 text-blue-400" 
              : "bg-call/20 text-call"
          )}>
            {accountType === 'PRACTICE' ? 'DEMO' : 'REAL'}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={refresh}
            disabled={isLoading}
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
          </Button>
        </div>
      </div>

      {/* Balance */}
      <div className="bg-secondary/50 rounded-xl p-4 mb-4">
        <div className="text-sm text-muted-foreground mb-1">Saldo Atual</div>
        <div className="text-2xl font-bold font-mono text-foreground">
          {formatCurrency(balance)}
        </div>
        <div className="flex items-center gap-1 mt-1">
          {dailyProfit >= 0 ? (
            <>
              <TrendingUp className="w-4 h-4 text-call" />
              <span className="text-sm text-call font-medium">
                +{formatCurrency(dailyProfit)} hoje
              </span>
            </>
          ) : (
            <>
              <TrendingDown className="w-4 h-4 text-put" />
              <span className="text-sm text-put font-medium">
                {formatCurrency(dailyProfit)} hoje
              </span>
            </>
          )}
        </div>
        {lastUpdate && (
          <div className="text-xs text-muted-foreground mt-2">
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
            <span className="text-xs text-muted-foreground">Trades Hoje</span>
          </div>
          <div className={cn('font-mono font-bold', isOvertrading ? 'text-gold' : 'text-foreground')}>
            {todayTrades}/{maxDailyTrades}
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
          <div className="text-lg font-bold text-primary">{winRate}%</div>
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
