import { useState, useEffect, useRef } from 'react';
import { Brain, Zap, CheckCircle, AlertTriangle, Loader2, Target } from 'lucide-react';
import { Card, CardContent } from './ui/card';
import { Badge } from './ui/badge';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import type { StrategyStat } from '@/lib/strategy-stats';
import { allDemoStrategyRows, demoStrategyStats, demoWinningPatternStats, DEMO_STRATEGY_CUTOFF } from '@/lib/demo-strategy-stats';

interface SignalEntry {
  id: string;
  asset: string;
  type: string;
  confluence_score: number;
  created_at: string;
  selected: boolean;
}

const strategyLabels: Record<string, string> = {
  PADRAO_VENCEDOR: 'Padrão vencedor',
  TENDENCIA: 'Tendência',
  CONTINUACAO_QUEDA_V1: 'Queda',
  TETO_V1: 'Teto',
  QUEDA_WIN_CALL_V1: 'Queda win',
  QUEDA_WIN_RETRY_V1: 'Queda win +1',
  FORCA_PADRAO_V1: 'Força padrão',
  FORCA_ANTECIPADA_V1: 'Força antecipada',
  TENDENCIA_3_LOSS_PUT: 'Tendência 3 perdas → Venda',
  TREND_WIN_LOSS_FORCE_LOSS: 'Retomada',
  TENDENCIA_V1: 'Tendência V1',
  FOUR_WIN_REVERSAL: 'Após 4 ganhos',
  THREE_FORCE: 'Após 3 Velas de Força',
  REVERSAO_RSI: 'Reversão RSI',
  VELA_FORCA: 'Vela de força',
  FORCA_SEM_ROMPIMENTO_PRIMEIRA: 'forca sem',
  TAKASHI_BNF_V1: 'Takashi Kotegawa',
  FORCA_INVERTIDA: 'Força Invertida',
  ROMPIMENTO: 'Rompimento',
  RECUO_EMA21: 'Recuo na média 21',
  KDJ: 'KDJ',
  ICHIMOKU: 'Ichimoku',
  ICHIMOKU_FORCA: 'Ichimoku + Vela de Força',
  KDJ_RSI: 'KDJ + Reversão RSI',
  TESTES_HISTORICO: 'Testes (histórico)',
  AI: 'IA',
};

export function AIAnalysisStatusCard() {
  const [recentSignals, setRecentSignals] = useState<SignalEntry[]>([]);
  const [strategyStats, setStrategyStats] = useState<StrategyStat[]>([]);
  const [lastSignalTime, setLastSignalTime] = useState<Date | null>(null);
  const [isActive, setIsActive] = useState(false);
  const [analysisError, setAnalysisError] = useState(false);
  const statsBusy = useRef(false);
  const statsQueued = useRef(false);
  const mounted = useRef(true);

  const fetchStrategyStats = async () => {
    if (statsBusy.current) { statsQueued.current = true; return; }
    statsBusy.current = true;
    try {
      const rows = await allDemoStrategyRows(async (from, to) => {
        const { data, error } = await supabase.from('iq_demo_test_orders')
          .select('signal_id,entry_strategy,result,status,profit,iq_option_id,entry_minute')
          .eq('status','confirmed').not('iq_option_id','is',null)
          .order('created_at', { ascending: true }).order('id', { ascending: true })
          .range(from, to);
        if (error) throw error;
        const orders=data??[];
        const ids=orders.map(row=>row.signal_id);
        const patterns=new Map<string,unknown>();
        for(let i=0;i<ids.length;i+=100){
          const {data:candidates,error:patternError}=await supabase.from('iq_demo_test_candidates')
            .select('signal_id,pattern_match').in('signal_id',ids.slice(i,i+100));
          if(patternError)throw patternError;
          for(const candidate of candidates??[])patterns.set(candidate.signal_id,candidate.pattern_match);
        }
        return orders.map(row=>({...row,pattern_match:patterns.get(row.signal_id)}));
      });
      if (mounted.current) {
        setStrategyStats([demoWinningPatternStats(rows),...demoStrategyStats(rows)]);
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
      const [candidates, rejections] = await Promise.all([
        supabase.from('iq_demo_test_candidates')
          .select('signal_id,asset,direction,score,entry_minute')
          .eq('entry_strategy', 'TAKASHI_BNF_V1').gte('entry_minute', tenMinAgo)
          .order('entry_minute', { ascending: false }).limit(50),
        supabase.from('demo_selection_rejections')
          .select('signal_id,asset,direction,score,entry_minute')
          .eq('entry_strategy', 'TAKASHI_BNF_V1').gte('entry_minute', tenMinAgo)
          .order('entry_minute', { ascending: false }).limit(50),
      ]);
      if (candidates.error || rejections.error) throw candidates.error ?? rejections.error;
      const entries = new Map<string, SignalEntry>();
      for (const row of rejections.data ?? []) entries.set(row.signal_id, {
        id: row.signal_id, asset: row.asset, type: row.direction,
        confluence_score: row.score ?? 0, created_at: row.entry_minute, selected: false,
      });
      for (const row of candidates.data ?? []) entries.set(row.signal_id, {
        id: row.signal_id, asset: row.asset, type: row.direction,
        confluence_score: row.score, created_at: row.entry_minute, selected: true,
      });
      const data = [...entries.values()].sort((a,b) => Date.parse(b.created_at) - Date.parse(a.created_at));
      if (!mounted.current) return;
      setAnalysisError(false);
      if (data.length > 0) {
        setRecentSignals(data);
        setLastSignalTime(new Date(data[0].created_at));
        // Active if signal was generated in last 2 minutes
        setIsActive(Date.now() - new Date(data[0].created_at).getTime() < 2 * 60 * 1000);
      } else {
        setRecentSignals([]);
        setLastSignalTime(null);
        setIsActive(false);
      }
    } catch {
      if (mounted.current) { setAnalysisError(true); setIsActive(false); }
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
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'demo_selection_rejections' }, () => {
        fetchSignals();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'iq_demo_test_orders' }, () => {
        void fetchStrategyStats();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'iq_demo_test_candidates' }, () => {
        void fetchSignals();
        void fetchStrategyStats();
      })
      .subscribe(status => { if (status === 'SUBSCRIBED') void fetchStrategyStats(); });
    return () => { supabase.removeChannel(channel); };
  }, []);

  const timeSinceLastSignal = lastSignalTime
    ? Math.round((Date.now() - lastSignalTime.getTime()) / 1000)
    : null;

  const getTimeSinceText = () => {
    if (timeSinceLastSignal === null) return 'Sem análises recentes';
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
              <Brain className={cn('w-4 h-4', isActive ? 'text-primary animate-pulse motion-reduce:animate-none' : 'text-muted-foreground')} />
            </div>
            <div>
              <h3 className="text-sm font-semibold">
                IA Analisando
              </h3>
              <p className="text-[10px] text-muted-foreground">
                Takashi Kotegawa · Última análise: {getTimeSinceText()}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {isActive && <Loader2 className="w-3 h-3 animate-spin text-primary" />}
            <Badge
              variant={isActive ? "default" : "secondary"}
              className={cn("text-[10px]", isActive && "bg-primary text-primary-foreground")}
            >
              {analysisError ? 'INDISPONÍVEL' : isActive ? 'ANALISANDO' : 'SEM ANÁLISE RECENTE'}
            </Badge>
          </div>
        </div>

        {/* Pipeline status */}
        <div className="grid grid-cols-3 gap-2 mb-3">
          <div className="bg-secondary/50 rounded-lg p-2 text-center">
            <Zap className="w-3.5 h-3.5 text-gold mx-auto mb-1" />
            <div className="text-xs font-bold">{new Set(recentSignals.map(s => s.asset)).size}</div>
            <div className="text-[10px] text-muted-foreground">Ativos registrados (10min)</div>
          </div>
          <div className="bg-secondary/50 rounded-lg p-2 text-center">
            <CheckCircle className="w-3.5 h-3.5 text-call mx-auto mb-1" />
            <div className="text-xs font-bold">
              {recentSignals.filter(s => s.selected).length}
            </div>
            <div className="text-[10px] text-muted-foreground">Selecionados Demo</div>
          </div>
          <div className="bg-secondary/50 rounded-lg p-2 text-center">
            <AlertTriangle className="w-3.5 h-3.5 text-gold mx-auto mb-1" />
            <div className="text-xs font-bold">
              {recentSignals.filter(s => !s.selected).length}
            </div>
            <div className="text-[10px] text-muted-foreground">Não selecionados</div>
          </div>
        </div>

        {/* Recent signals list */}
        {recentSignals.length > 0 && (
          <div className="space-y-1">
            <p className="text-[10px] text-muted-foreground">Ativos analisados · registros Takashi</p>
            <div className="max-h-60 overflow-y-auto space-y-1">
            {recentSignals.map(signal => (
              <div key={signal.id} className="flex flex-wrap gap-2 items-center justify-between p-1.5 rounded bg-secondary/30 text-xs">
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
                    signal.selected ? "text-call" : "text-muted-foreground"
                  )}>
                    nota {signal.confluence_score.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                  <span className="text-muted-foreground text-[10px]">
                    {new Date(signal.created_at).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>
            ))}
            </div>
          </div>
        )}

        {/* Assertividade acumulada por estratégia */}
        {strategyStats.length > 0 && (
          <div className="mt-3 pt-3 border-t border-border/40">
            <div className="flex items-center gap-1.5 mb-2">
              <Target className="w-3.5 h-3.5 text-gold" />
              <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Assertividade por estratégia · Demo</span>
            </div>
            <p className="mb-2 text-[10px] text-muted-foreground">Desde {new Date(DEMO_STRATEGY_CUTOFF).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}</p>
            <div className="space-y-1">
              {strategyStats.map(stat => {
                const settled = stat.wins + stat.losses;
                const percent = settled > 0 ? (stat.wins / settled) * 100 : 0;
                return (
                  <div key={stat.strategy} className="flex items-center justify-between text-xs p-1.5 rounded bg-secondary/20">
                    <span className="min-w-0 whitespace-normal break-words">{strategyLabels[stat.strategy] ?? stat.strategy}</span>
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
            {analysisError ? 'Não foi possível consultar as análises.' : 'Nenhuma análise Takashi registrada nos últimos 10 minutos.'}
          </div>
        )}
      </CardContent>
    </Card>
  );
}