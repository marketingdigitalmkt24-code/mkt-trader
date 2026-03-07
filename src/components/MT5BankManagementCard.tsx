import { useState, useEffect, useCallback } from 'react';
import { Wallet, TrendingUp, TrendingDown, AlertTriangle, Activity, Calendar, RotateCcw, Loader2, Server, Target } from 'lucide-react';
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

  const fetchStats = useCallback(async () => {
    try {
      const now = new Date();
      const todayUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
      const thirtyDaysAgo = new Date(todayUTC);
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      // Fetch today + last 30 days in parallel
      const [todayRes, monthRes] = await Promise.all([
        supabase
          .from('operation_results')
          .select('asset, result, profit, entry_price')
          .gte('created_at', todayUTC.toISOString())
          .order('created_at', { ascending: true }),
        supabase
          .from('operation_results')
          .select('asset, result, profit')
          .gte('created_at', thirtyDaysAgo.toISOString())
      ]);

      if (todayRes.error) throw todayRes.error;

      const filterMT5 = (rows: any[]) => (rows || []).filter(r => {
        const asset = r.asset?.toUpperCase() || '';
        return !asset.includes('OTC') && asset.includes('USD');
      });

      const mt5Results = filterMT5(todayRes.data);
      const mt5Results30d = filterMT5(monthRes.data);

      let profit = 0;
      let wins = 0;
      let losses = 0;
      let consecutiveLosses = 0;
      let currentStreak = 0;

      for (const result of mt5Results) {
        const resultType = result.result?.toLowerCase();
        if (resultType === 'win') {
          wins++;
          profit += result.profit || 0;
          currentStreak = 0;
        } else if (resultType === 'loss' || resultType === 'loose') {
          losses++;
          profit += result.profit || 0;
          currentStreak++;
          consecutiveLosses = Math.max(consecutiveLosses, currentStreak);
        }
      }

      // Calculate 30d P&L
      let pnl30d = 0;
      for (const r of mt5Results30d) {
        const rt = r.result?.toLowerCase();
        if (rt === 'win' || rt === 'loss' || rt === 'loose') {
          pnl30d += r.profit || 0;
        }
      }

      setStats({
        dailyProfit: profit,
        todayTrades: mt5Results.filter(r => r.result?.toLowerCase() !== 'pending').length,
        wins,
        losses,
        consecutiveLosses,
        pnl30d,
      });
    } catch (error) {
      console.error('Error fetching MT5 stats:', error);
    }
  }, []);

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

      setStats({ dailyProfit: 0, todayTrades: 0, wins: 0, losses: 0, consecutiveLosses: 0, pnl30d: 0 });
      toast({ title: 'Resultados resetados', description: 'IQ Option e MT5 zerados com sucesso.' });
    } catch (error) {
      console.error('Error resetting MT5 stats:', error);
      toast({ title: 'Erro', description: 'Não foi possível resetar.', variant: 'destructive' });
    } finally {
      setIsResetting(false);
    }
  };

  const fetchBalance = useCallback(async () => {
    try {
      const { data, error } = await supabase.functions.invoke('metaapi-monitor-positions');
      if (!error && data) {
        setMt5Balance({
          balance: data.balance ?? null,
          equity: data.equity ?? null,
          currency: data.currency || 'USD',
        });
      }
    } catch (e) {
      console.error('Error fetching MT5 balance:', e);
    }
  }, []);

  useEffect(() => {
    fetchStats();
    fetchBalance();
    const interval = setInterval(fetchStats, 15000);
    const balanceInterval = setInterval(fetchBalance, 30000);

    const channel = supabase
      .channel('mt5-bank-stats')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'operation_results' }, () => {
        fetchStats();
      })
      .subscribe();

    return () => {
      clearInterval(interval);
      clearInterval(balanceInterval);
      supabase.removeChannel(channel);
    };
  }, [fetchStats, fetchBalance]);

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

      {/* Win/Loss Stats */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className="bg-call/10 rounded-lg p-2 text-center">
          <div className="text-lg font-bold text-call">{stats.wins}</div>
          <div className="text-xs text-muted-foreground">Wins</div>
        </div>
        <div className="bg-put/10 rounded-lg p-2 text-center">
          <div className="text-lg font-bold text-put">{stats.losses}</div>
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
          <span>Trades Hoje</span>
          <span>{stats.todayTrades}/{maxDailyTrades}</span>
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
