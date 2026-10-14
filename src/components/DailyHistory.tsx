import { useState, useEffect } from 'react';
import { History, TrendingUp, TrendingDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';

interface DayResult {
  date: string;
  profit: number;
  wins: number;
  losses: number;
  trades: number;
}

interface DailyHistoryProps {
  title: string;
  timeframeFilter?: string; // 'MT5' for MT5, undefined for IQ Option (M1, M5, etc.)
  excludeTimeframe?: string; // exclude specific timeframe
  daysToFetch?: number;
  perPage?: number;
}

const getBrasiliaDateKey = (date: Date) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);

export function DailyHistory({
  title,
  timeframeFilter,
  excludeTimeframe,
  daysToFetch = 30,
  perPage = 3,
}: DailyHistoryProps) {
  const [days, setDays] = useState<DayResult[]>([]);
  const [page, setPage] = useState(0);

  useEffect(() => {
    fetchHistory();
    const interval = setInterval(fetchHistory, 60000);
    return () => clearInterval(interval);
  }, []);

  const fetchHistory = async () => {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysToFetch);

    let query = supabase
      .from('operation_results')
      .select('created_at, profit, result, timeframe')
      .gte('created_at', startDate.toISOString())
      .order('created_at', { ascending: false });

    if (timeframeFilter) {
      query = query.eq('timeframe', timeframeFilter);
    } else {
      // Card de resultados IQ Option: só operações reais, sem testes nem MT5
      query = query.neq('timeframe', 'TEST').neq('timeframe', 'MT5');
    }
    if (excludeTimeframe) {
      query = query.neq('timeframe', excludeTimeframe);
    }

    const { data, error } = await query;
    if (error || !data) return;

    const grouped: Record<string, { profit: number; wins: number; losses: number; trades: number }> = {};
    for (const r of data) {
      const date = getBrasiliaDateKey(new Date(r.created_at));
      if (!grouped[date]) grouped[date] = { profit: 0, wins: 0, losses: 0, trades: 0 };
      grouped[date].profit += r.profit;
      grouped[date].trades++;
      if (r.result === 'win') grouped[date].wins++;
      else if (r.result === 'loss') grouped[date].losses++;
    }

    const result = Object.entries(grouped)
      .map(([date, s]) => ({ date, ...s }))
      .sort((a, b) => b.date.localeCompare(a.date));

    setDays(result);
  };

  // Exclude today
  const todayKey = getBrasiliaDateKey(new Date());
  const pastDays = days.filter(d => d.date !== todayKey);

  if (pastDays.length === 0) return null;

  const totalPages = Math.ceil(pastDays.length / perPage);
  const visible = pastDays.slice(page * perPage, (page + 1) * perPage);

  const formatCurrency = (v: number) => `$ ${v.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
  const formatDate = (d: string) => {
    const [, m, day] = d.split('-');
    return `${day}/${m}`;
  };

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <History className="w-4 h-4 text-muted-foreground" />
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</span>
        </div>
        {totalPages > 1 && (
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5"
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
            >
              <ChevronLeft className="w-3 h-3" />
            </Button>
            <span className="text-[10px] font-mono text-muted-foreground">{page + 1}/{totalPages}</span>
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5"
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
            >
              <ChevronRight className="w-3 h-3" />
            </Button>
          </div>
        )}
      </div>
      <div className="space-y-1.5">
        {visible.map((day) => {
          const winRate = (day.wins + day.losses) > 0 ? (day.wins / (day.wins + day.losses)) * 100 : 0;
          return (
            <div key={day.date} className={cn(
              "flex items-center justify-between p-2.5 rounded-lg border",
              day.profit >= 0 ? "bg-call/5 border-call/15" : "bg-put/5 border-put/15"
            )}>
              <div className="flex items-center gap-2">
                {day.profit >= 0 ? (
                  <TrendingUp className="w-3.5 h-3.5 text-call" />
                ) : (
                  <TrendingDown className="w-3.5 h-3.5 text-put" />
                )}
                <span className="text-xs font-mono text-muted-foreground">{formatDate(day.date)}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[10px] text-muted-foreground">
                  {day.wins}W/{day.losses}L
                  <span className="ml-1 font-mono">({winRate.toFixed(0)}%)</span>
                </span>
                <span className={cn(
                  "text-xs font-bold font-mono",
                  day.profit >= 0 ? "text-call" : "text-put"
                )}>
                  {day.profit >= 0 ? '+' : ''}{formatCurrency(day.profit)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
