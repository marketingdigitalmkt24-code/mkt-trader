import { Wallet, TrendingUp, TrendingDown, AlertTriangle, Target, Activity, RefreshCw, Loader2, Wifi, WifiOff, PlugZap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Progress } from '@/components/ui/progress';
import { useIQOptionConnection } from '@/hooks/useIQOptionConnection';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

export function BankManagementCard() {
  const {
    balance,
    dailyStats,
    isLoading,
    lastUpdate,
    connectionStatus,
    connect,
    disconnect,
    isConnected,
  } = useIQOptionConnection();

  const { dailyProfit, todayTrades, wins, losses, consecutiveLosses } = dailyStats;
  const currency = balance?.currency || 'USD';
  const accountType = balance?.accountType || 'PRACTICE';
  const currentBalance = balance?.balance || 0;

  const maxDailyTrades = 20;
  const riskPerTrade = 2;
  const suggestedBet = (currentBalance * riskPerTrade) / 100;
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

  const getConnectionStatusColor = () => {
    switch (connectionStatus) {
      case 'connected': return 'text-call';
      case 'disconnected': return 'text-put';
      case 'error': return 'text-put';
      case 'connecting': return 'text-gold';
    }
  };

  const getConnectionStatusText = () => {
    switch (connectionStatus) {
      case 'connected': return 'Conectado à IQ Option (client-side)';
      case 'disconnected': return 'Desconectado';
      case 'error': return 'Erro na conexão - Clique para reconectar';
      case 'connecting': return 'Conectando...';
    }
  };

  const handleConnectionToggle = () => {
    if (isConnected) {
      disconnect();
    } else {
      connect();
    }
  };

  return (
    <section className="glass-card p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Wallet className="w-5 h-5 text-primary" />
          <h3 className="font-semibold text-foreground">Gestão de Banca</h3>
        </div>
        <div className="flex items-center gap-2">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                {connectionStatus === 'connected' ? (
                  <Wifi className={cn("w-4 h-4", getConnectionStatusColor())} />
                ) : connectionStatus === 'connecting' ? (
                  <Loader2 className={cn("w-4 h-4 animate-spin", getConnectionStatusColor())} />
                ) : (
                  <WifiOff className={cn("w-4 h-4", getConnectionStatusColor())} />
                )}
              </TooltipTrigger>
              <TooltipContent>
                <p>{getConnectionStatusText()}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <span className={cn(
            "text-xs px-2 py-0.5 rounded-full",
            accountType === 'PRACTICE' 
              ? "bg-blue-500/20 text-blue-400" 
              : "bg-call/20 text-call"
          )}>
            {accountType === 'PRACTICE' ? 'DEMO' : 'REAL'}
          </span>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={handleConnectionToggle}
                  disabled={isLoading || connectionStatus === 'connecting'}
                >
                  {isLoading || connectionStatus === 'connecting' ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : isConnected ? (
                    <RefreshCw className="w-4 h-4" />
                  ) : (
                    <PlugZap className="w-4 h-4" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{isConnected ? 'Reconectar' : 'Conectar à IQ Option'}</p>
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
        
        {/* Profit/Loss indicator */}
        <div className={cn(
          "mt-3 p-2 rounded-lg flex items-center justify-center gap-2",
          dailyProfit >= 0 
            ? "bg-call/20 border border-call/30" 
            : "bg-put/20 border border-put/30"
        )}>
          {dailyProfit >= 0 ? (
            <>
              <TrendingUp className="w-5 h-5 text-call" />
              <span className="text-lg font-bold text-call">
                +{formatCurrency(dailyProfit)}
              </span>
              <span className="text-sm text-call/80">hoje</span>
            </>
          ) : (
            <>
              <TrendingDown className="w-5 h-5 text-put" />
              <span className="text-lg font-bold text-put">
                {formatCurrency(dailyProfit)}
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
