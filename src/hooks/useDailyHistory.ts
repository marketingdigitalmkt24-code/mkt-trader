import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface DailyResult {
  date: string; // YYYY-MM-DD (Brasília)
  trades: number;
  wins: number;
  losses: number;
  ties: number;
  profit: number;
  winRate: number;
}

export function useDailyHistory(days: number = 7) {
  const [history, setHistory] = useState<DailyResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchHistory = useCallback(async () => {
    setIsLoading(true);
    try {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);

      let query = supabase
        .from('operation_results')
        .select('result, profit, entry_price, created_at, iq_option_id')
        .gte('created_at', cutoff.toISOString())
        .in('result', ['win', 'loss', 'loose', 'tie', 'equal'])
        .order('created_at', { ascending: false });

      // Filter by source platform
      if (source === 'iq') {
        query = query.not('iq_option_id', 'is', null);
      } else if (source === 'mt5') {
        query = query.is('iq_option_id', null);
      }

      const { data, error } = await query;

      if (error) throw error;

      // Group by Brasília date
      const byDay = new Map<string, { wins: number; losses: number; ties: number; profit: number }>();

      for (const row of data || []) {
        const brasiliaDate = new Date(row.created_at).toLocaleDateString('en-CA', {
          timeZone: 'America/Sao_Paulo',
        });

        const entry = byDay.get(brasiliaDate) || { wins: 0, losses: 0, ties: 0, profit: 0 };
        const r = row.result?.toLowerCase();

        if (r === 'win') {
          entry.wins++;
          entry.profit += row.profit || 0;
        } else if (r === 'loss' || r === 'loose') {
          entry.losses++;
          entry.profit -= row.entry_price || 0;
        } else {
          entry.ties++;
        }

        byDay.set(brasiliaDate, entry);
      }

      const results: DailyResult[] = [];
      byDay.forEach((v, date) => {
        const total = v.wins + v.losses + v.ties;
        results.push({
          date,
          trades: total,
          wins: v.wins,
          losses: v.losses,
          ties: v.ties,
          profit: v.profit,
          winRate: total > 0 ? (v.wins / total) * 100 : 0,
        });
      });

      results.sort((a, b) => b.date.localeCompare(a.date));
      setHistory(results);
    } catch (e) {
      console.error('Error fetching daily history:', e);
    } finally {
      setIsLoading(false);
    }
  }, [days, source]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  // Realtime updates
  useEffect(() => {
    const channel = supabase
      .channel('daily-history-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'operation_results' }, () => {
        fetchHistory();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchHistory]);

  return { history, isLoading, refresh: fetchHistory };
}
