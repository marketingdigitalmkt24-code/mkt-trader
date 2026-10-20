import { useState, useEffect, useRef } from 'react';
import { Brain, Zap, Clock, CheckCircle, XCircle, AlertTriangle, Loader2, Target } from 'lucide-react';
import { Card, CardContent } from './ui/card';
import { Badge } from './ui/badge';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { allStrategyRows, strategyStats as summarizeStrategyStats, type StrategyStat } from '@/lib/strategy-stats';

interface SignalEntry {
  id: string;
  asset: string;
  type: string;
  confluence_score: number;
  created_at: string;
}

const strategyLabels: Record<string, string> = {
  TENDENCIA: 'Tendência',
  TREND_WIN_LOSS_FORCE_LOSS: 'Retomada',
  TENDENCIA_V1: 'Tendência V1',
  FOUR_WIN_REVERSAL: 'Após 4 ganhos',
  THREE_FORCE: 'Após 3 Velas de Força',
  REVERSAO_RSI: 'Reversão RSI',
  VELA_FORCA: 'Vela de força',
  FORCA_INVERTIDA: 'Força Invertida',
  ROMPIMENTO: 'Rompimento',
  RECUO_EMA21: 'Recuo na média 21',
  KDJ: 'KDJ',
  ICHIMOKU: 'Ichimoku',
  AI: 'IA',
};

export function AIAnalysisStatusCard() {
  const [recentSignals, setRecentSignals] = useState<SignalEntry[]>([]);
  const [strategyStats, setStrategyStats] = useState<StrategyStat[]>([]);
  const [lastSignalTime, setLastSignalTime] = useState<Date | null>(null);
  const [isActive, setIsActive] = useState(false);
  const statsBusy = useRef(false);
  const statsQueued = useRef(false);
  const mounted = useRef(true);

  const fetchStrategyStats = async () => {
    if (statsBusy.current) { statsQueued.current = true; return; }
    statsBusy.current = true;
    try {
      const rows = await allStrategyRows(async (from, to) => {
        const { data, error } = await supabase.from('operation_results')
          .select('entry_strategy, result, timeframe, test_sequence_strategy, test_inverted_strategy')
          .or('timeframe.is.null,timeframe.neq.MT5')
          .not('signal_id', 'like', 'mt5-%').not('signal_id', 'like', 'copy-%')
          .not('entry_strategy', 'is', null)
          .order('created_at', { ascending: true }).order('id', { ascending: true })
          .range(from, to);
        if (error) throw error;
        return data ?? [];
      });
      if (mounted.current) {
        const stats = summarizeStrategyStats(rows);
        setStrategyStats(stats);
      }
    } catch {
      // silent
    } finally {
      statsBusy.current = false;
      if (statsQueued.current && mounted.current) {
        statsQueued.current = false;
        void fetchStrategyStats();
      }
    }
  };

  const fetchSignals = async () => {
    try {
      const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      const { data } = await supabase
        .from('trading_signals')
        .select('id, asset, type, confluence_score, created_at')
        .gte('created_at', tenMinAgo)
        .order('created_at', { ascending: false })
        .limit(8);

      if (data && data.length > 0) {
        setRecentSignals(data);
        setLastSignalTime(new Date(data[0].created_at));
        // Active if signal was generated in last 2 minutes
        setIsActive(Date.now() - new Date(data[0].created_at).getTime() < 2 * 60 * 1000);
      } else {
        setRecentSignals([]);
        setIsActive(false);
      }
    } catch {
      // silent
    }
  };

  useEffect(() => {
    mounted.current = true;
    fetchSignals();
    fetchStrategyStats();
    const interval = setInterval(() => {
      fetchSignals();
      fetchStrategyStats();
    }, 10000);
    const refresh = () => { fetchSignals(); void fetchStrategyStats(); };
    const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      mounted.current = false;
      clearInterval(interval);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel('ai-signals')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'trading_signals' }, () => {
        fetchSignals();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'operation_results' }, () => {
        void fetchStrategyStats();
      })
      .subscribe(status => { if (status === 'SUBSCRIBED') void fetchStrategyStats(); });
    return () => { supabase.removeChannel(channel); };
  }, []);

  const timeSinceLastSignal = lastSignalTime
    ? Math.round((Date.now() - lastSignalTime.getTime()) / 1000)
    : null;

  const getTimeSinceText = () => {
    if (!timeSinceLastSignal) return 'Sem sinais recentes';
    if (timeSinceLastSignal < 60) return `${timeSinceLastSignal}s atrás`;
    if (timeSinceLastSignal < 3600) return `${Math.floor(timeSinceLastSignal / 60)}min atrás`;
    return `${Math.floor(timeSinceLastSignal / 3600)}h atrás`;
  };

  return (
    <Card className={cn(
      "border transition-all duration-300",
      isActive
        ? "border-primary/30 bg-primary/5"
        : "border-border/50"
    )}>
      <CardContent className="p-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className={cn(
              "w-8 h-8 rounded-lg flex items-center justify-center",
              isActive ? "bg-primary/20" : "bg-muted"
            )}>
              {isActive ? (
                <Brain className="w-4 h-4 text-primary animate-pulse" />
              ) : (
                <Clock className="w-4 h-4 text-muted-foreground" />
              )}
            </div>
            <div>
              <h3 className="text-sm font-semibold">
                {isActive ? 'IA Analisando' : 'IA Aguardando'}
              </h3>
              <p className="text-[10px] text-muted-foreground">
                Último sinal: {getTimeSinceText()}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {isActive && <Loader2 className="w-3 h-3 animate-spin text-primary" />}
            <Badge
              variant={isActive ? "default" : "secondary"}
              className={cn("text-[10px]", isActive && "bg-primary text-primary-foreground")}
            >
              {isActive ? 'ATIVA' : 'STANDBY'}
            </Badge>
          </div>
        </div>

        {/* Pipeline status */}
        <div className="grid grid-cols-3 gap-2 mb-3">
          <div className="bg-secondary/50 rounded-lg p-2 text-center">
            <Zap className="w-3.5 h-3.5 text-gold mx-auto mb-1" />
            <div className="text-xs font-bold">{recentSignals.length}</div>
            <div className="text-[10px] text-muted-foreground">Sinais (10min)</div>
          </div>
          <div className="bg-secondary/50 rounded-lg p-2 text-center">
            <CheckCircle className="w-3.5 h-3.5 text-call mx-auto mb-1" />
            <div className="text-xs font-bold">
              {recentSignals.filter(s => s.confluence_score >= 85).length}
            </div>
            <div className="text-[10px] text-muted-foreground">Alta Conf.</div>
          </div>
          <div className="bg-secondary/50 rounded-lg p-2 text-center">
            <AlertTriangle className="w-3.5 h-3.5 text-gold mx-auto mb-1" />
            <div className="text-xs font-bold">
              {recentSignals.filter(s => s.confluence_score < 85).length}
            </div>
            <div className="text-[10px] text-muted-foreground">Baixa Conf.</div>
          </div>
        </div>

        {/* Recent signals list */}
        {recentSignals.length > 0 && (
          <div className="space-y-1">
            {recentSignals.slice(0, 5).map(signal => (
              <div key={signal.id} className="flex items-center justify-between p-1.5 rounded bg-secondary/30 text-xs">
                <div className="flex items-center gap-1.5">
                  {signal.type === 'CALL' ? (
                    <Badge className="bg-call/20 text-call text-[9px] px-1 py-0">CALL</Badge>
                  ) : (
                    <Badge className="bg-put/20 text-put text-[9px] px-1 py-0">PUT</Badge>
                  )}
                  <span className="font-medium">{signal.asset}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className={cn(
                    "font-mono text-[10px]",
                    signal.confluence_score >= 85 ? "text-call" : "text-gold"
                  )}>
                    {signal.confluence_score}%
                  </span>
                  <span className="text-muted-foreground text-[10px]">
                    {new Date(signal.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Assertividade acumulada por estratégia */}
        {strategyStats.length > 0 && (
          <div className="mt-3 pt-3 border-t border-border/40">
            <div className="flex items-center gap-1.5 mb-2">
              <Target className="w-3.5 h-3.5 text-gold" />
              <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Assertividade por estratégia · Todo o histórico</span>
            </div>
            <div className="space-y-1">
              {strategyStats.map(stat => {
                const settled = stat.wins + stat.losses;
                const percent = settled > 0 ? (stat.wins / settled) * 100 : 0;
                return (
                  <div key={stat.strategy} className="flex items-center justify-between text-xs p-1.5 rounded bg-secondary/20">
                    <span className="truncate">{strategyLabels[stat.strategy] ?? stat.strategy}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[10px] text-muted-foreground tabular-nums">{stat.wins}W / {stat.losses}L</span>
                      <span className={cn(
                        'font-bold tabular-nums',
                        percent >= 52 ? 'text-call' : percent >= 45 ? 'text-gold' : 'text-put'
                      )}>
                        {percent.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {recentSignals.length === 0 && (
          <div className="text-xs text-muted-foreground text-center py-4 bg-secondary/20 rounded-lg">
            <Brain className="w-5 h-5 mx-auto mb-1 opacity-30" />
            Aguardando sinais para análise IA...
          </div>
        )}
      </CardContent>
    </Card>
  );
}