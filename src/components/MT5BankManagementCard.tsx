import { useState, useEffect, useCallback } from 'react';
import { Wallet, TrendingUp, TrendingDown, AlertTriangle, Activity, Calendar, RotateCcw, Loader2, Server, Target, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { MT5DailyHistory } from './MT5DailyHistory';

interface MT5DailyStats {
  dailyProfit: number;
  todayTrades: number;
  wins: number;
  losses: number;
  consecutiveLosses: number;
  pnl30d: number;
}

interface MT5BalanceInfo {
  balance: number | null;
  equity: number | null;
  currency: string;
}

const getBrasiliaDateKey = () => {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
};

export function MT5BankManagementCard() {
  const { toast } = useToast();
  const [stats, setStats] = useState<MT5DailyStats>({
    dailyProfit: 0,
    todayTrades: 0,
    wins: 0,
    losses: 0,
    consecutiveLosses: 0,
    pnl30d: 0,
  });
  const [mt5Balance, setMt5Balance] = useState<MT5BalanceInfo>({ balance: null, equity: null, currency: 'USD' });
  const [isLoading, setIsLoading] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [isResetToday, setIsResetToday] = useState(() => {
    const saved = localStorage.getItem('mt5_reset_date');
    return saved === getBrasiliaDateKey();
  });

  const fetchBalance = useCallback(async () => {
    try {
      const { data, error } = await supabase.functions.invoke('metaapi-monitor-positions');
      if (!error && data) {
        setMt5Balance({
          balance: data.balance ?? null,
          equity: data.equity ?? null,
          currency: data.currency || 'USD',
        });

        // Check if reset was done today (Brasília time)
        const resetDate = localStorage.getItem('mt5_reset_date');
        const resetActive = resetDate === getBrasiliaDateKey();
        setIsResetToday(resetActive);

        if (!resetActive) {
          setStats({
            dailyProfit: data.todayProfit ?? 0,
            todayTrades: data.todayTrades ?? 0,
            wins: data.todayWins ?? 0,
            losses: data.todayLosses ?? 0,
            consecutiveLosses: data.consecutiveLosses ?? 0,
            pnl30d: data.pnl30d ?? 0,
          });
        }
        // If reset is active, keep stats at zero (don't overwrite)
      }
    } catch (e) {
      console.error('Error fetching MT5 data:', e);
    }
  }, []);

  const handleReset = async () => {
    setIsResetting(true);
    try {
      // Persist reset flag for today (Brasília time)
      const today = getBrasiliaDateKey();
      localStorage.setItem('mt5_reset_date', today);
      setIsResetToday(true);

      // Also delete MT5 results from operation_results
      const now = new Date();
      const todayUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
      const { data: results } = await supabase
        .from('operation_results')
        .select('id')
        .gte('created_at', todayUTC.toISOString());

      if (results && results.length > 0) {
        for (const r of results) {
          await supabase.from('operation_results').delete().eq('id', r.id);
        }
      }

      setStats({ dailyProfit: 0, todayTrades: 0, wins: 0, losses: 0, consecutiveLosses: 0, pnl30d: 0 });
      toast({ title: 'Resultados resetados', description: 'MT5 e IQ Option zerados com sucesso.' });
    } catch (error) {
      console.error('Error resetting MT5 stats:', error);
      toast({ title: 'Erro', description: 'Não foi possível resetar.', variant: 'destructive' });
    } finally {
      setIsResetting(false);
    }
  };

  useEffect(() => {
    fetchBalance();
    const balanceInterval = setInterval(fetchBalance, 30000);

    return () => {
      clearInterval(balanceInterval);
    };
  }, [fetchBalance]);

  const totalDecided = stats.wins + stats.losses;
  const winRate = totalDecided > 0 ? (stats.wins / totalDecided) * 100 : 0;
  const maxDailyTrades = 20;
  const tradeProgress = (stats.todayTrades / maxDailyTrades) * 100;
  const isOvertrading = stats.todayTrades >= maxDailyTrades * 0.8;
  const hasConsecutiveLosses = stats.consecutiveLosses >= 2;

  const formatCurrency = (value: number) => `$ ${value.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

  return (
    <section className="glass-card p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Server className="w-5 h-5 text-primary" />
          <h3 className="font-semibold text-foreground">Gestão de Banca MT5</h3>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs px-2 py-0.5 rounded-full bg-primary/20 text-primary">MT5</span>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => { setIsLoading(true); fetchBalance().finally(() => setIsLoading(false)); }}
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
                <p>Resetar resultados MT5</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      {/* Balance Header */}
      <div className="bg-secondary/50 rounded-xl p-4 mb-4">
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm text-muted-foreground">Saldo Atual</span>
          {mt5Balance.equity !== null && mt5Balance.equity !== mt5Balance.balance && (
            <span className={cn("text-xs font-semibold", (mt5Balance.equity ?? 0) >= (mt5Balance.balance ?? 0) ? "text-call" : "text-put")}>
              Equity: {formatCurrency(mt5Balance.equity)}
            </span>
          )}
        </div>
        <div className="text-2xl font-bold font-mono text-foreground">
          {mt5Balance.balance !== null ? formatCurrency(mt5Balance.balance) : '—'}
        </div>
      </div>

      {/* Today's Performance Card */}
      <div className={cn(
        "rounded-xl p-4 mb-4 border",
        stats.dailyProfit >= 0 
          ? "bg-call/5 border-call/20" 
          : "bg-put/5 border-put/20"
      )}>
        <div className="flex items-center gap-2 mb-3">
          <Calendar className="w-4 h-4 text-muted-foreground" />
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Resultado de Hoje</span>
        </div>

        {/* Main P&L */}
        <div className="flex items-center justify-center gap-3 mb-4">
          <div className={cn(
            "w-10 h-10 rounded-full flex items-center justify-center",
            stats.dailyProfit >= 0 ? "bg-call/20" : "bg-put/20"
          )}>
            {stats.dailyProfit >= 0 ? (
              <TrendingUp className="w-5 h-5 text-call" />
            ) : (
              <TrendingDown className="w-5 h-5 text-put" />
            )}
          </div>
          <span className={cn(
            "text-3xl font-bold font-mono",
            stats.dailyProfit >= 0 ? "text-call" : "text-put"
          )}>
            {stats.dailyProfit >= 0 ? '+' : ''}{formatCurrency(stats.dailyProfit)}
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
            <div className="text-lg font-bold font-mono text-call leading-tight">{stats.wins}</div>
            <div className="text-[9px] uppercase tracking-widest text-call/60 font-bold mt-0.5">Wins</div>
          </div>
          <div className="bg-put/10 rounded-lg p-2 text-center">
            <div className="text-lg font-bold font-mono text-put leading-tight">{stats.losses}</div>
            <div className="text-[9px] uppercase tracking-widest text-put/60 font-bold mt-0.5">Losses</div>
          </div>
          <div className="bg-secondary/60 rounded-lg p-2 text-center">
            <div className={cn('text-lg font-bold font-mono leading-tight', isOvertrading ? 'text-gold' : 'text-foreground')}>
              {stats.todayTrades}
            </div>
            <div className="text-[9px] uppercase tracking-widest text-muted-foreground font-bold mt-0.5">Trades</div>
          </div>
          <div className="bg-secondary/60 rounded-lg p-2 text-center">
            <div className={cn('text-base font-bold font-mono leading-tight', stats.pnl30d >= 0 ? 'text-call' : 'text-put')}>
              {stats.pnl30d >= 0 ? '+' : ''}{formatCurrency(stats.pnl30d).replace('$ ', '')}
            </div>
            <div className="text-[9px] uppercase tracking-widest text-muted-foreground font-bold mt-0.5">30d</div>
          </div>
        </div>

        {/* Trade Limit Progress */}
        <div className="mt-3 pt-3 border-t border-border/30">
          <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
            <span>Limite diário</span>
            <span className="font-mono">{stats.todayTrades}/{maxDailyTrades}</span>
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
              <span className="text-xs text-gold">Limite de operações próximo</span>
            </div>
          )}
          {hasConsecutiveLosses && (
            <div className="flex items-center gap-2 p-2 bg-put/10 border border-put/20 rounded-lg">
              <AlertTriangle className="w-4 h-4 text-put flex-shrink-0" />
              <span className="text-xs text-put">{stats.consecutiveLosses} perdas consecutivas</span>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
