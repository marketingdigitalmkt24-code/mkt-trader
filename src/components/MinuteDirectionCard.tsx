import { useEffect, useState, useCallback } from 'react';
import { Clock, TrendingUp, TrendingDown } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface MinuteStat {
  minute: number;
  direction: 'CALL' | 'PUT';
  wins: number;
  losses: number;
  winRate: number;
  total: number;
}

const MIN_SAMPLE = 8;

export function MinuteDirectionCard() {
  const [stats, setStats] = useState<MinuteStat[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchStats = useCallback(async () => {
    try {
      const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
      const { data } = await supabase
        .from('operation_results')
        .select('direction, result, created_at')
        .in('result', ['win', 'loss'])
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(5000);

      if (!data) { setIsLoading(false); return; }

      const map = new Map<string, { wins: number; losses: number }>();
      for (const r of data) {
        const brt = new Date(new Date(r.created_at).getTime() - 3 * 60 * 60 * 1000);
        const key = `${brt.getUTCMinutes()}-${r.direction}`;
        const s = map.get(key) || { wins: 0, losses: 0 };
        if (r.result === 'win') s.wins++; else s.losses++;
        map.set(key, s);
      }

      const all: MinuteStat[] = [];
      for (const [key, s] of map.entries()) {
        const [m, dir] = key.split('-');
        const total = s.wins + s.losses;
        if (total < MIN_SAMPLE) continue;
        all.push({
          minute: parseInt(m),
          direction: dir as 'CALL' | 'PUT',
          wins: s.wins,
          losses: s.losses,
          total,
          winRate: Math.round((s.wins / total) * 1000) / 10,
        });
      }
      all.sort((a, b) => b.winRate - a.winRate || b.total - a.total);
      setStats(all);
    } catch (err) {
      console.error('Minute stats error:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 60000);
    return () => clearInterval(interval);
  }, [fetchStats]);

  if (isLoading) {
    return (
      <div className="glass-card p-4 animate-pulse">
        <div className="h-5 bg-muted/30 rounded w-1/2 mb-3" />
        <div className="space-y-2">
          <div className="h-4 bg-muted/20 rounded w-full" />
          <div className="h-4 bg-muted/20 rounded w-3/4" />
        </div>
      </div>
    );
  }

  const best = stats.filter(s => s.winRate >= 55).slice(0, 8);
  const worst = [...stats].sort((a, b) => a.winRate - b.winRate).filter(s => s.winRate < 45).slice(0, 5);

  const row = (s: MinuteStat, good: boolean) => (
    <div key={`${s.minute}-${s.direction}`} className={`flex items-center justify-between rounded px-2 py-1 ${good ? 'bg-green-500/5' : 'bg-red-500/5'}`}>
      <div className="flex items-center gap-2">
        <span className="text-xs font-mono font-medium text-foreground">:{String(s.minute).padStart(2, '0')}</span>
        <span className={`text-[10px] font-semibold ${s.direction === 'CALL' ? 'text-emerald-400' : 'text-rose-400'}`}>{s.direction}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className={`text-[10px] font-medium ${good ? 'text-green-400' : 'text-red-400'}`}>{s.winRate}%</span>
        <span className="text-[10px] text-muted-foreground">{s.wins}W/{s.losses}L</span>
      </div>
    </div>
  );

  return (
    <div className="glass-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-amber-400" />
          <h3 className="text-sm font-semibold text-foreground">Minuto × Direção</h3>
        </div>
        <span className="text-[10px] text-muted-foreground bg-secondary/50 px-2 py-0.5 rounded-full">14 dias</span>
      </div>

      {best.length === 0 && worst.length === 0 ? (
        <p className="text-xs text-muted-foreground">Sem dados suficientes ainda (mínimo {MIN_SAMPLE} operações por minuto).</p>
      ) : (
        <>
          {best.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-1.5">
                <TrendingUp className="w-3 h-3 text-green-400" />
                <p className="text-[11px] font-medium text-muted-foreground">Melhores minutos</p>
              </div>
              <div className="space-y-1">{best.map(s => row(s, true))}</div>
            </div>
          )}
          {worst.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-1.5">
                <TrendingDown className="w-3 h-3 text-red-400" />
                <p className="text-[11px] font-medium text-muted-foreground">Piores minutos</p>
              </div>
              <div className="space-y-1">{worst.map(s => row(s, false))}</div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
