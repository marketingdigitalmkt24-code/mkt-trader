import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { startOfDay, startOfWeek, startOfMonth, subDays } from 'date-fns';

export type StatsPeriod = 'today' | 'week' | 'month';

interface TradingStats {
  profit: number;
  trades: number;
  wins: number;
  losses: number;
  ties: number;
  consecutiveLosses: number;
  winRate: number;
}

export function useTradingStats() {
  const [period, setPeriod] = useState<StatsPeriod>('today');
  const [stats, setStats] = useState<TradingStats>({
    profit: 0,
    trades: 0,
    wins: 0,
    losses: 0,
    ties: 0,
    consecutiveLosses: 0,
    winRate: 0,
  });
  const [isLoading, setIsLoading] = useState(false);

  const getStartDate = useCallback((p: StatsPeriod): Date => {
    const now = new Date();
    
    switch (p) {
      case 'today':
        // Use UTC to match database timestamps
        return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
      case 'week':
        const weekStart = startOfWeek(now, { weekStartsOn: 1 }); // Monday
        return new Date(Date.UTC(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate(), 0, 0, 0, 0));
      case 'month':
        const monthStart = startOfMonth(now);
        return new Date(Date.UTC(monthStart.getFullYear(), monthStart.getMonth(), monthStart.getDate(), 0, 0, 0, 0));
      default:
        return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
    }
  }, []);

  const fetchStats = useCallback(async () => {
    setIsLoading(true);
    try {
      const startDate = getStartDate(period);
      console.log(`Fetching stats for period '${period}' from:`, startDate.toISOString());

      const { data: results, error } = await supabase
        .from('operation_results')
        .select('result, profit, entry_price')
        .gte('created_at', startDate.toISOString())
        .order('created_at', { ascending: true });

      if (error) throw error;

      let profit = 0;
      let wins = 0;
      let losses = 0;
      let ties = 0;
      let consecutiveLosses = 0;
      let currentStreak = 0;

      for (const result of results || []) {
        const resultType = result.result?.toLowerCase();
        if (resultType === 'win') {
          wins++;
          profit += result.profit || 0;
          currentStreak = 0;
        } else if (resultType === 'loss' || resultType === 'loose') {
          losses++;
          profit -= result.entry_price || 0;
          currentStreak++;
          consecutiveLosses = Math.max(consecutiveLosses, currentStreak);
        } else if (resultType === 'tie' || resultType === 'equal') {
          ties++;
          currentStreak = 0;
        }
      }

      const completedTrades = wins + losses + ties;
      const winRate = completedTrades > 0 ? (wins / completedTrades) * 100 : 0;

      console.log(`Stats for '${period}':`, { profit, wins, losses, ties, completedTrades, winRate });

      setStats({
        profit,
        trades: completedTrades,
        wins,
        losses,
        ties,
        consecutiveLosses,
        winRate,
      });
    } catch (error) {
      console.error('Error fetching trading stats:', error);
    } finally {
      setIsLoading(false);
    }
  }, [period, getStartDate]);

  // Fetch stats when period changes
  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  // Subscribe to realtime updates
  useEffect(() => {
    const channel = supabase
      .channel('trading-stats-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'operation_results'
        },
        () => {
          fetchStats();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchStats]);

  return {
    period,
    setPeriod,
    stats,
    isLoading,
    refresh: fetchStats,
  };
}
