import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface AssetMetric {
  asset: string;
  wins: number;
  losses: number;
  winRate: number;
  profit: number;
  trades: number;
}

export interface AILearningMetrics {
  totalTrades: number;
  overallWinRate: number;
  totalProfit: number;
  topAssets: AssetMetric[];
  worstAssets: AssetMetric[];
  bestHours: number[];
  isLoading: boolean;
}

export function useAILearningMetrics(): AILearningMetrics {
  const [metrics, setMetrics] = useState<AILearningMetrics>({
    totalTrades: 0,
    overallWinRate: 0,
    totalProfit: 0,
    topAssets: [],
    worstAssets: [],
    bestHours: [],
    isLoading: true,
  });

  const fetchMetrics = useCallback(async () => {
    try {
      const fourteenDaysAgo = new Date();
      fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

      const { data: results } = await supabase
        .from('operation_results')
        .select('asset, result, profit, created_at')
        .gte('created_at', fourteenDaysAgo.toISOString())
        .order('created_at', { ascending: false })
        .limit(500);

      if (!results || results.length === 0) {
        setMetrics(prev => ({ ...prev, isLoading: false }));
        return;
      }

      let totalWins = 0;
      let totalLosses = 0;
      let totalProfit = 0;

      const assetStats: Record<string, { wins: number; losses: number; profit: number }> = {};
      const hourStats: Record<number, { wins: number; losses: number; profit: number }> = {};

      for (const r of results) {
        const isWin = r.result === 'win';
        const isLoss = r.result === 'loss';
        totalProfit += r.profit || 0;
        if (isWin) totalWins++;
        if (isLoss) totalLosses++;

        if (!assetStats[r.asset]) assetStats[r.asset] = { wins: 0, losses: 0, profit: 0 };
        if (isWin) assetStats[r.asset].wins++;
        if (isLoss) assetStats[r.asset].losses++;
        assetStats[r.asset].profit += r.profit || 0;

        const hour = new Date(r.created_at).getUTCHours();
        if (!hourStats[hour]) hourStats[hour] = { wins: 0, losses: 0, profit: 0 };
        if (isWin) hourStats[hour].wins++;
        if (isLoss) hourStats[hour].losses++;
        hourStats[hour].profit += r.profit || 0;
      }

      const allAssets: AssetMetric[] = Object.entries(assetStats).map(([asset, s]) => {
        const total = s.wins + s.losses;
        return {
          asset,
          wins: s.wins,
          losses: s.losses,
          winRate: total > 0 ? Math.round((s.wins / total) * 1000) / 10 : 0,
          profit: Math.round(s.profit * 100) / 100,
          trades: total,
        };
      });

      const topAssets = [...allAssets].sort((a, b) => b.profit - a.profit).filter(a => a.profit > 0).slice(0, 3);
      const worstAssets = [...allAssets].sort((a, b) => a.profit - b.profit).filter(a => a.profit < 0 && a.trades >= 2).slice(0, 3);

      const bestHours: number[] = [];
      for (const [hourStr, hs] of Object.entries(hourStats)) {
        const total = hs.wins + hs.losses;
        if (total >= 3 && (hs.wins / total) >= 0.6 && hs.profit > 0) {
          bestHours.push(parseInt(hourStr));
        }
      }

      const totalAll = totalWins + totalLosses;

      setMetrics({
        totalTrades: results.length,
        overallWinRate: totalAll > 0 ? Math.round((totalWins / totalAll) * 1000) / 10 : 0,
        totalProfit: Math.round(totalProfit * 100) / 100,
        topAssets,
        worstAssets,
        bestHours: bestHours.sort((a, b) => a - b),
        isLoading: false,
      });
    } catch (err) {
      console.error('Error fetching AI learning metrics:', err);
      setMetrics(prev => ({ ...prev, isLoading: false }));
    }
  }, []);

  useEffect(() => {
    fetchMetrics();
    const interval = setInterval(fetchMetrics, 60000);
    return () => clearInterval(interval);
  }, [fetchMetrics]);

  return metrics;
}
