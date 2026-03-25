import { useState, useEffect, useCallback } from 'react';
import { Wallet, TrendingUp, TrendingDown, AlertTriangle, Activity, Calendar, RotateCcw, Loader2, Server, Target, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

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
    const today = new Date().toISOString().slice(0, 10);
    return saved === today;
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

        // Check if reset was done today
        const resetDate = localStorage.getItem('mt5_reset_date');
        const today = new Date().toISOString().slice(0, 10);
        const resetActive = resetDate === today;
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
      // Persist reset flag for today
      const today = new Date().toISOString().slice(0, 10);
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

      {/* Balance + Stats (same style as IQ Option) */}
      <div className="bg-secondary/50 rounded-xl p-4 mb-4">
        <div className="text-sm text-muted-foreground mb-1">Saldo Atual</div>
        <div className="text-2xl font-bold font-mono text-foreground">
          {mt5Balance.balance !== null ? formatCurrency(mt5Balance.balance) : '—'}
        </div>
        {mt5Balance.equity !== null && mt5Balance.equity !== mt5Balance.balance && (
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs text-muted-foreground">Equity:</span>
            <span className={cn("text-sm font-semibold", (mt5Balance.equity ?? 0) >= (mt5Balance.balance ?? 0) ? "text-call" : "text-put")}>
              {formatCurrency(mt5Balance.equity)}
            </span>
          </div>
        )}

        {/* Stats label - Today only */}
        <div className="flex items-center justify-center gap-1 mt-3 mb-2">
          <Calendar className="w-4 h-4 text-muted-foreground mr-1" />
          <span className="text-xs text-muted-foreground">Estatísticas de Hoje</span>
        </div>

        {/* Profit/Loss indicator */}
        <div className={cn(
          "p-2 rounded-lg flex items-center justify-center gap-2",
          stats.dailyProfit >= 0
            ? "bg-call/20 border border-call/30"
            : "bg-put/20 border border-put/30"
        )}>
          {stats.dailyProfit >= 0 ? (
            <>
              <TrendingUp className="w-5 h-5 text-call" />
              <span className="text-lg font-bold text-call">+{formatCurrency(stats.dailyProfit)}</span>
              <span className="text-sm text-call/80">hoje</span>
            </>
          ) : (
            <>
              <TrendingDown className="w-5 h-5 text-put" />
              <span className="text-lg font-bold text-put">{formatCurrency(stats.dailyProfit)}</span>
              <span className="text-sm text-put/80">hoje</span>
            </>
          )}
        </div>
      </div>

      {/* Win Rate Bar */}
      <div className="mb-4">
        <div className="flex items-center justify-between text-sm mb-2">
          <span className="text-muted-foreground">Win Rate</span>
          <span className={cn(
            'font-bold font-mono',
            winRate >= 60 ? 'text-call' : winRate >= 50 ? 'text-gold' : 'text-put'
          )}>
            {winRate.toFixed(1)}%
          </span>
        </div>
        <Progress 
          value={winRate} 
          className={cn(
            "h-2.5 rounded-full",
            winRate >= 60 ? '[&>div]:bg-call' : winRate >= 50 ? '[&>div]:bg-gold' : '[&>div]:bg-put'
          )}
        />
      </div>

      {/* Win/Loss/Trades/P&L Stats */}
      <div className="grid grid-cols-4 gap-2 mb-4">
        <div className="bg-call/10 border border-call/20 rounded-lg p-2.5 text-center">
          <div className="text-xl font-bold font-mono text-call">{stats.wins}</div>
          <div className="text-[10px] uppercase tracking-wider text-call/70 font-semibold">Wins</div>
        </div>
        <div className="bg-put/10 border border-put/20 rounded-lg p-2.5 text-center">
          <div className="text-xl font-bold font-mono text-put">{stats.losses}</div>
          <div className="text-[10px] uppercase tracking-wider text-put/70 font-semibold">Losses</div>
        </div>
        <div className="bg-secondary/50 border border-border/30 rounded-lg p-2.5 text-center">
          <div className={cn('text-xl font-bold font-mono', isOvertrading ? 'text-gold' : 'text-foreground')}>
            {stats.todayTrades}
          </div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Trades</div>
        </div>
        <div className="bg-secondary/50 border border-border/30 rounded-lg p-2.5 text-center">
          <div className={cn('text-lg font-bold font-mono', stats.pnl30d >= 0 ? 'text-call' : 'text-put')}>
            {stats.pnl30d >= 0 ? '+' : ''}{formatCurrency(stats.pnl30d).replace('$ ', '')}
          </div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">30d</div>
        </div>
      </div>

      {/* Trade Progress */}
      <div className="mb-4">
        <div className="flex justify-between text-xs text-muted-foreground mb-2">
          <span>Progresso Diário</span>
          <span className="font-mono">{stats.todayTrades}/{maxDailyTrades}</span>
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
