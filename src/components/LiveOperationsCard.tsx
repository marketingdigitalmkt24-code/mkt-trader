import { useState, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Activity, TrendingUp, TrendingDown, Target, Clock, MonitorSmartphone, Loader2, Volume2, VolumeX } from 'lucide-react';
import { Card, CardContent } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { expandTestObservations } from '@/lib/live-test-observations';
import { linkedForceBrokerResult, type TestBrokerResult } from '@/lib/test-broker-result';

interface OpenPosition {
  id: string;
  type: string;
  asset: string;
  direction: string;
  invest: number;
  pnl: number;
}

const typeLabel = (t: string) =>
  t === 'forex' ? 'FOREX' : t === 'digital-option' ? 'DIGITAL' : t === 'turbo-option' ? 'BINÁRIA' : t === 'binary-option' ? 'BINÁRIA' : t.toUpperCase();

interface RecentTrade {
  id: string;
  asset: string;
  direction: string;
  result: string;
  profit: number;
  created_at: string;
  is_auto_trade: boolean;
  timeframe: string;
  signal_id: string;
  entry_strategy?: string;
  strategy?: string;
  telegram_sent?: boolean;
  test_sequence_strategy?: string | null;
  test_inverted_strategy?: string | null;
}

const strategyLabels: Record<string, string> = {
  TENDENCIA: 'Tendência',
  TENDENCIA_V1: 'Tendência V1',
  FOUR_WIN_REVERSAL: 'Após 4 ganhos',
  THREE_FORCE: 'Após 3 Velas de Força',
  HISTORICO: 'Histórico bom',
  EMPATE: 'Empate',
  REVERSAO_RSI: 'Reversão RSI',
  VELA_FORCA: 'Vela de força',
  FORCA_SEM_ROMPIMENTO_PRIMEIRA: 'Força sem rompimento · primeira vela',
  FORCA_INVERTIDA: 'Força Invertida',
  ROMPIMENTO: 'Rompimento',
  RECUO_EMA21: 'Recuo na média 21',
  KDJ: 'KDJ',
  ICHIMOKU: 'Ichimoku',
  PULLBACK: 'Pullback + Pavio',
  EDGE: 'Edge Scanner',
  AI: 'IA',
  WICK: 'Pavio',
  CHART: 'Gráfico 24h',
};

export function LiveOperationsCard() {
  const PAGE_SIZE = 10;
  const queryClient = useQueryClient();
  const [recentLoading, setRecentLoading] = useState(true);
  const [pageLoading, setPageLoading] = useState(false);
  const hasLoadedRef = useRef(false);
  const [pageLoading, setPageLoading] = useState(false);
  const [recentError, setRecentError] = useState(false);
  const [recentTrades, setRecentTrades] = useState<RecentTrade[]>([]);
  const [linkedOrders, setLinkedOrders] = useState<TestBrokerResult[]>([]);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [stats, setStats] = useState({ wins: 0, losses: 0, testWinsToday: 0, testLossesToday: 0 });
  const pageRef = useRef(1);
  const [brokerOpen, setBrokerOpen] = useState<OpenPosition[]>([]);
  const [recordedOpen, setRecordedOpen] = useState<OpenPosition[]>([]);
  // Corretora (com lucro ao vivo) tem prioridade; ordens registradas cobrem o intervalo entre consultas.
  const openPositions = [...brokerOpen, ...recordedOpen.filter(r => !brokerOpen.some(b => b.id === r.id))];
  const [openLoading, setOpenLoading] = useState(true);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isFetchingRef = useRef(false);
  const recentRequestRef = useRef(0);
  const initialHorn = typeof window !== 'undefined' && localStorage.getItem('hornEnabled') === '1';
  const [hornEnabled, setHornEnabled] = useState(initialHorn);
  const hornEnabledRef = useRef(initialHorn);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const seenSignalsRef = useRef<Set<string>>(new Set());
  const hornPrimedRef = useRef(false);

  // Buzina: dois bips estilo buzina de carro
  const playHorn = () => {
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') void ctx.resume();
      const beep = (startAt: number, duration: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'square';
        osc.frequency.value = 440;
        gain.gain.setValueAtTime(0.0001, startAt);
        gain.gain.exponentialRampToValueAtTime(0.3, startAt + 0.02);
        gain.gain.setValueAtTime(0.3, startAt + duration - 0.05);
        gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
        osc.connect(gain).connect(ctx.destination);
        osc.start(startAt);
        osc.stop(startAt + duration);
      };
      const now = ctx.currentTime;
      beep(now, 0.35);
      beep(now + 0.5, 0.35);
    } catch {
      // silent
    }
  };

  const toggleHorn = () => {
    const next = !hornEnabledRef.current;
    hornEnabledRef.current = next;
    setHornEnabled(next);
    localStorage.setItem('hornEnabled', next ? '1' : '0');
    if (next && !hornPrimedRef.current) {
      hornPrimedRef.current = true;
      playHorn(); // destrava o áudio do navegador com o clique
    }
  };

  // Buzina toca quando o sinal é ENVIADO para a IQ Option (status 'executing'),
  // ~30s antes da entrada real (que sai 2s antes da vela fechar). Testes não tocam.
  const checkNewSignals = async () => {
    if (!hornEnabledRef.current) return;
    try {
      const since = new Date(Date.now() - 90 * 1000).toISOString();
      const { data } = await supabase
        .from('trade_queue')
        .select('signal_id, created_at')
        .eq('status', 'executing')
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(5);
      for (const sig of data || []) {
        if (!seenSignalsRef.current.has(sig.signal_id)) {
          seenSignalsRef.current.add(sig.signal_id);
          playHorn();
        }
      }
      // limita o tamanho do conjunto
      if (seenSignalsRef.current.size > 200) {
        seenSignalsRef.current = new Set([...seenSignalsRef.current].slice(-100));
      }
    } catch {
      // silent
    }
  };

  // Posições abertas na IQ Option (binária, digital e forex)
  // Ordens principais confirmadas pela corretora e ainda sem resultado (atualiza a cada 3s).
  const fetchRecordedOpen = async () => {
    try {
      const { data } = await supabase.from('operation_results')
        .select('signal_id, asset, direction, iq_option_id, timeframe')
        .in('result', ['pending', 'open'])
        .neq('timeframe', 'TEST').neq('timeframe', 'MT5')
        .not('iq_option_id', 'is', null)
        .not('signal_id', 'like', 'copy-%').not('signal_id', 'like', 'sim-%').not('signal_id', 'like', 'mt5-%')
        .gte('created_at', new Date(Date.now() - 5 * 60 * 1000).toISOString())
        .limit(20);
      const rows = data || [];
      const { data: queue } = rows.length
        ? await supabase.from('trade_queue').select('signal_id, amount').in('signal_id', rows.map(r => r.signal_id))
        : { data: [] };
      const amounts = new Map((queue || []).map(q => [q.signal_id, Number(q.amount || 0)]));
      setRecordedOpen(rows.map(r => ({
        id: String(r.iq_option_id), type: r.timeframe === 'FOREX' ? 'forex' : 'binary-option',
        asset: r.asset, direction: r.direction, invest: amounts.get(r.signal_id) || 0, pnl: 0,
      })));
    } catch {
      // silent
    } finally {
      setOpenLoading(false);
    }
  };

  const fetchOpen = async () => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    try {
      const { data } = await supabase.functions.invoke('iqoption-open-positions');
      if (data?.success) setBrokerOpen(data.positions || []);
    } catch {
      // silent
    } finally {
      setOpenLoading(false);
      isFetchingRef.current = false;
    }
  };

  // Count only the first page; prefetch and cache each page independently.
  const loadRecentPage = async (requestedPage: number) => {
      const from = (requestedPage - 1) * PAGE_SIZE;
      const { data, count, error } = await supabase
        .from('operation_results')
        .select('id, asset, direction, result, profit, created_at, is_auto_trade, timeframe, signal_id, entry_strategy, telegram_sent, test_sequence_strategy, test_inverted_strategy', requestedPage === 1 ? { count: 'exact' } : {})
        .or('timeframe.is.null,timeframe.neq.MT5')
        .not('signal_id', 'like', 'mt5-%')
        .not('signal_id', 'like', 'copy-%')
        .not('signal_id', 'like', 'sim-%')
        .or('entry_strategy.is.null,entry_strategy.not.in.(FORCE_LOSS_WIN,FORCA_INVERTIDA)')
        .not('signal_id', 'like', '%force-lw-%')
        // Ordens reais destas estratégias já aparecem em Entradas na IQ Option; aqui fica só o TESTE original.
        .or('timeframe.eq.TEST,entry_strategy.is.null,entry_strategy.not.in.(REVERSAO_RSI,RETOMADA,FORCA_INVERTIDA,VELA_FORCA)')
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .range(from, from + PAGE_SIZE - 1);
      if (error) throw error;
      if (!data) throw new Error('Missing operations');
      const forceIds = data.filter(trade => trade.timeframe === 'TEST' && trade.test_inverted_strategy === 'FORCA_INVERTIDA')
        .map(trade => `forca_invertida-${trade.id}`);
      const ids = [...new Set(data.filter(trade => !trade.entry_strategy).map(trade => trade.signal_id).filter(Boolean))];
      const [{ data: brokerOrders, error: brokerError }, { data: signals, error: signalsError }] = await Promise.all([
        forceIds.length
          ? supabase.from('operation_results').select('signal_id, iq_option_id, timeframe, result, profit').in('signal_id', forceIds)
          : Promise.resolve({ data: [], error: null }),
        ids.length
          ? supabase.from('trading_signals').select('signal_id, indicators').in('signal_id', ids)
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (brokerError) throw brokerError;
      if (signalsError) throw signalsError;
      const strategies = new Map((signals || []).map(signal => [
        signal.signal_id,
        typeof signal.indicators === 'object' && signal.indicators !== null && !Array.isArray(signal.indicators) && 'strategy' in signal.indicators
          ? String(signal.indicators.strategy)
          : '',
      ]));
      return {
        linkedOrders: brokerOrders || [],
        trades: data.map(trade => ({ ...trade, strategy: strategies.get(trade.signal_id) || '' })) as RecentTrade[],
        count,
      };
  };

  // Navegar de página nunca recarrega o card inteiro: mantém a lista atual visível
  // e troca o conteúdo quando a nova página chega (do cache ou da rede).
  const fetchRecentTrades = async (navigation = false) => {
    const requestedPage = pageRef.current;
    const request = ++recentRequestRef.current;
    if (navigation && !hasLoadedRef.current) setRecentLoading(true);
    else if (navigation) setPageLoading(true);
    try {
      const result = await queryClient.fetchQuery({
        queryKey: ['live-operations-page', requestedPage],
        queryFn: () => loadRecentPage(requestedPage),
        staleTime: 15000,
      });
      if (request !== recentRequestRef.current || requestedPage !== pageRef.current) return;
      hasLoadedRef.current = true;
      setLinkedOrders(result.linkedOrders);
      setRecentTrades(result.trades);
      setRecentError(false);
      if (typeof result.count === 'number') setTotalCount(result.count);
      if (result.trades.length === PAGE_SIZE) {
        void queryClient.prefetchQuery({
          queryKey: ['live-operations-page', requestedPage + 1],
          queryFn: () => loadRecentPage(requestedPage + 1),
          staleTime: 15000,
        });
      }
    } catch {
      if (request === recentRequestRef.current) setRecentError(true);
    } finally {
      if (request === recentRequestRef.current) {
        setRecentLoading(false);
        setPageLoading(false);
      }
    }
  };

  // Contadores de ganhos/perdas (geral) e resultado diário em teste (dia de Brasília)
  const fetchStats = async () => {
    try {
      const base = () => supabase.from('operation_results').select('*', { count: 'exact', head: true })
        .or('timeframe.is.null,timeframe.neq.MT5')
        .not('signal_id', 'like', 'mt5-%')
        .not('signal_id', 'like', 'copy-%')
        .not('signal_id', 'like', 'sim-%')
        .or('entry_strategy.is.null,entry_strategy.not.in.(FORCE_LOSS_WIN,FORCA_INVERTIDA)')
        .not('signal_id', 'like', '%force-lw-%')
        // Ordens reais destas estratégias já aparecem em Entradas na IQ Option; aqui fica só o TESTE original.
        .or('timeframe.eq.TEST,entry_strategy.is.null,entry_strategy.not.in.(REVERSAO_RSI,RETOMADA,FORCA_INVERTIDA,VELA_FORCA)');
      const brNow = new Date(Date.now() - 3 * 3600 * 1000);
      const dayStartIso = new Date(Date.UTC(brNow.getUTCFullYear(), brNow.getUTCMonth(), brNow.getUTCDate()) + 3 * 3600 * 1000).toISOString();
      const [w, l, tw, tl] = await Promise.all([
        base().eq('result', 'win'),
        base().eq('result', 'loss'),
        base().eq('timeframe', 'TEST').gte('created_at', dayStartIso).eq('result', 'win'),
        base().eq('timeframe', 'TEST').gte('created_at', dayStartIso).eq('result', 'loss'),
      ]);
      setStats({
        wins: w.count ?? 0,
        losses: l.count ?? 0,
        testWinsToday: tw.count ?? 0,
        testLossesToday: tl.count ?? 0,
      });
    } catch {
      // silent
    }
  };

  useEffect(() => {
    pageRef.current = page;
    void fetchRecentTrades(true);
  }, [page]);

  useEffect(() => {
    fetchStats();
    fetchOpen();
    fetchRecordedOpen();
    const recordedPoll = setInterval(fetchRecordedOpen, 3000);
    pollRef.current = setInterval(() => {
      fetchRecentTrades();
      fetchStats();
      fetchOpen();
    }, 15000);
    return () => { clearInterval(recordedPoll); if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  // Poll de sinais novos para a buzina (a cada 10s)
  useEffect(() => {
    const hornPoll = setInterval(checkNewSignals, 3000);
    return () => clearInterval(hornPoll);
  }, []);

  // Subscribe to realtime operation_results
  useEffect(() => {
    const channel = supabase
      .channel('live-ops')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'operation_results' }, () => {
        void queryClient.invalidateQueries({ queryKey: ['live-operations-page'], refetchType: 'none' });
        void fetchRecentTrades();
        fetchStats();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const isMt5Trade = (trade: RecentTrade) =>
    trade.timeframe === 'MT5' || trade.signal_id?.startsWith('mt5-');

  const iqTrades = recentTrades.filter(t => !isMt5Trade(t));
  const totalOpenPnl = openPositions.reduce((sum, p) => sum + (p.pnl || 0), 0);
  const totalIqProfit = iqTrades.reduce((sum, t) => sum + t.profit, 0);
  const hitTotal = stats.wins + stats.losses;
  const hitPct = hitTotal > 0 ? Math.round((stats.wins / hitTotal) * 100) : 0;
  const testTodayTotal = stats.testWinsToday + stats.testLossesToday;
  const testTodayPct = testTodayTotal > 0 ? Math.round((stats.testWinsToday / testTodayTotal) * 100) : 0;

  const getResultColor = (result: string) => {
    if (result === 'win') return 'text-call';
    if (result === 'loss') return 'text-put';
    if (result === 'pending' || result === 'open' || result === 'test_open' || result === 'test7_open') return 'text-gold';
    return 'text-muted-foreground';
  };

  const getResultBg = (result: string) => {
    if (result === 'win') return 'bg-call/10';
    if (result === 'loss') return 'bg-put/10';
    if (result === 'pending' || result === 'open' || result === 'test_open' || result === 'test7_open') return 'bg-gold/10';
    return 'bg-secondary/50';
  };

  return (
    <Card className="border-border/50">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-4">
          <Activity className="w-5 h-5 text-primary" />
          <h3 className="text-sm font-semibold">Operações em Tempo Real</h3>
          <Button
            size="sm"
            variant={hornEnabled ? 'default' : 'secondary'}
            className="h-7 px-2 text-xs ml-auto gap-1"
            onClick={toggleHorn}
            title="Buzina toca quando uma operação abre na IQ Option"
          >
            {hornEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
            Buzina
          </Button>
        </div>

        {/* Posições abertas */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground">Operações Abertas</span>
            </div>
            <Badge variant="secondary" className="text-[10px]">{openPositions.length} abertas</Badge>
          </div>
          {openLoading ? (
            <div className="flex justify-center py-3"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>
          ) : openPositions.length > 0 ? (
            <div className="space-y-1">
              {openPositions.map(p => {
                const pct = p.invest > 0 ? Math.min(100, Math.max(0, (p.pnl / p.invest) * 100)) : 0;
                return (
                  <div key={p.id} className="p-2 rounded-lg text-xs bg-gold/10">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {p.direction === 'CALL' ? <TrendingUp className="w-3 h-3 text-call" /> : <TrendingDown className="w-3 h-3 text-put" />}
                        <span className="font-medium">{p.asset}</span>
                        <Badge variant="outline" className="text-[9px] px-1 py-0 h-4">{typeLabel(p.type)}</Badge>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground font-mono">${p.invest.toFixed(2)}</span>
                        <span className={cn("font-mono font-bold", p.pnl >= 0 ? "text-call" : "text-put")}>
                          {p.pnl >= 0 ? '+' : '-'}${Math.abs(p.pnl).toFixed(2)}
                        </span>
                      </div>
                    </div>
                    {p.type === 'forex' && (
                      <div className="mt-1.5 flex items-center gap-2">
                        <Target className="w-3 h-3 text-muted-foreground" />
                        <div className="flex-1 h-1 rounded-full bg-secondary overflow-hidden">
                          <div className="h-full bg-call" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-[10px] text-muted-foreground font-mono">{pct.toFixed(0)}% / 100%</span>
                      </div>
                    )}
                  </div>
                );
              })}
              <div className="flex items-center justify-between pt-1.5 border-t border-border/50">
                <span className="text-xs text-muted-foreground">Resultado aberto</span>
                <span className={cn("text-xs font-mono font-bold", totalOpenPnl >= 0 ? "text-call" : "text-put")}>
                  {totalOpenPnl >= 0 ? '+' : '-'}${Math.abs(totalOpenPnl).toFixed(2)}
                </span>
              </div>
            </div>
          ) : (
            <div className="text-xs text-muted-foreground text-center py-3 bg-secondary/30 rounded-lg">
              Nenhuma operação aberta agora
            </div>
          )}
        </div>

        {/* IQ Option Recent Trades */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <MonitorSmartphone className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground">IQ Option — Últimas Operações</span>
            </div>
            <div className="flex items-center gap-1 flex-wrap justify-end">
              <Badge variant="secondary" className="text-[10px]">{totalCount} no total</Badge>
              <Badge variant="secondary" className="text-[10px] text-call bg-call/10">✓ {stats.wins} ganhos</Badge>
              <Badge variant="secondary" className="text-[10px] text-put bg-put/10">✗ {stats.losses} perdas</Badge>
              <Badge variant="secondary" className="text-[10px]">{hitPct}%</Badge>
            </div>
          </div>

          {testTodayTotal > 0 && (
            <div className="flex items-center justify-between mb-2 px-2 py-1.5 rounded-lg bg-secondary/30 text-[10px]">
              <span className="text-muted-foreground">Resultado diário (teste)</span>
              <span className="flex items-center gap-2 font-mono">
                <span className="text-call">✓ {stats.testWinsToday}</span>
                <span className="text-put">✗ {stats.testLossesToday}</span>
                <span className="text-muted-foreground">{testTodayPct}%</span>
              </span>
            </div>
          )}

          {recentLoading ? (
            <div role="status" aria-label="Carregando operações" className="flex justify-center py-3"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>
          ) : recentError ? (
            <div role="alert" className="text-xs text-destructive text-center py-3">Não foi possível carregar esta página.</div>
          ) : iqTrades.length > 0 ? (
            <div className={cn("space-y-1 transition-opacity", pageLoading && "opacity-50 pointer-events-none")}>
              {iqTrades.flatMap(expandTestObservations).map(trade => {
                const broker = linkedForceBrokerResult(trade, linkedOrders);
                return (
                <div key={trade.id} className={cn(
                  "flex flex-wrap items-center justify-between gap-x-2 gap-y-1 p-2 rounded-lg text-xs",
                  getResultBg(trade.result)
                )}>
                  <div className="flex flex-wrap items-center gap-2 min-w-0">
                    {trade.direction === 'CALL' || trade.direction === 'call' ? (
                      <TrendingUp className="w-3 h-3 text-call shrink-0" />
                    ) : (
                      <TrendingDown className="w-3 h-3 text-put shrink-0" />
                    )}
                    <span className="font-medium">{trade.asset}</span>
                    <span className="text-[10px] text-muted-foreground font-mono">
                      {new Date(trade.created_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </span>
                    {trade.timeframe === 'TEST' && (
                      <Badge variant="outline" className="text-[9px] px-1 py-0 h-4">TESTE</Badge>
                    )}
                    {trade.timeframe === 'TEST' && trade.test_sequence_strategy === 'TREND_WIN_LOSS_FORCE_LOSS' && (
                      <Badge variant="outline" className="text-[9px] px-1 py-0 h-auto min-h-4 whitespace-normal border-primary/50 text-primary">📐 RETOMADA</Badge>
                    )}
                    {trade.entry_strategy === 'FORCA_INVERTIDA' && (
                      <Badge variant="outline" className="text-[9px] px-1 py-0 h-auto min-h-4 whitespace-normal border-primary/50 text-primary">🔄 FORÇA INVERTIDA</Badge>
                    )}
                    {trade.timeframe === 'TEST' && ['VELA_FORCA', 'FORCA_INVERTIDA'].includes(trade.entry_strategy ?? '') && (
                      <Badge variant="outline" className={cn('text-[9px] px-1 py-0 h-4', trade.direction === 'CALL' ? 'text-call border-call/50' : 'text-put border-put/50')}>{trade.direction}</Badge>
                    )}
                    {trade.entry_strategy === 'TENDENCIA' && (
                      <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 border-amber-500/50 text-amber-500">📐 TENDÊNCIA</Badge>
                    )}
                    {trade.entry_strategy === 'TENDENCIA_V1' && (
                      <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 border-amber-500/50 text-amber-500">📐 TENDÊNCIA V1</Badge>
                    )}
                    {trade.entry_strategy === 'FOUR_WIN_REVERSAL' && (
                      <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 border-primary/50 text-primary">🔄 APÓS 4 GANHOS</Badge>
                    )}
                    {trade.entry_strategy === 'THREE_FORCE' && (
                      <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 border-primary/50 text-primary">🕯️ APÓS 3 VELAS DE FORÇA</Badge>
                    )}
                    {trade.entry_strategy === 'HISTORICO' && (
                      <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 border-amber-500/50 text-amber-500">📜 HISTÓRICO BOM</Badge>
                    )}
                    {trade.entry_strategy === 'EMPATE' && (
                      <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 border-amber-500/50 text-amber-500">🤝 EMPATE</Badge>
                    )}
                    {trade.entry_strategy === 'REVERSAO_RSI' && (
                      <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 border-primary/50 text-primary">🔄 REVERSÃO RSI</Badge>
                    )}
                    {trade.entry_strategy === 'FORCA_SEM_ROMPIMENTO_PRIMEIRA' && (
                      <Badge variant="outline" className="text-[9px] px-1 py-0 min-h-4 h-auto whitespace-normal border-primary/50 text-primary">FORÇA SEM ROMPIMENTO · PRIMEIRA VELA</Badge>
                    )}
                    {trade.entry_strategy && ({ VELA_FORCA: '🕯️ VELA DE FORÇA', ROMPIMENTO: '🚀 ROMPIMENTO', RECUO_EMA21: '↩️ RECUO MÉDIA 21', KDJ: '📊 KDJ', ICHIMOKU: '☁️ ICHIMOKU' } as Record<string, string>)[trade.entry_strategy] && (
                      <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 border-primary/50 text-primary">
                        {({ VELA_FORCA: '🕯️ VELA DE FORÇA', ROMPIMENTO: '🚀 ROMPIMENTO', RECUO_EMA21: '↩️ RECUO MÉDIA 21', KDJ: '📊 KDJ', ICHIMOKU: '☁️ ICHIMOKU' } as Record<string, string>)[trade.entry_strategy]}
                      </Badge>
                    )}
                    {trade.telegram_sent && (
                      <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 border-sky-500/50 text-sky-500">📣 Telegram</Badge>
                    )}
                    {trade.timeframe === 'FOREX' && (
                      <Badge variant="outline" className="text-[9px] px-1 py-0 h-4">FOREX</Badge>
                    )}
                    {!strategyLabels[trade.entry_strategy || ''] && (
                      <Badge variant="outline" className="text-[9px] px-1 py-0 h-auto min-h-4 whitespace-normal text-muted-foreground">
                        {trade.entry_strategy ? 'Não identificada' : strategyLabels[trade.strategy || ''] || 'Não identificada'}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-auto">
                    {trade.timeframe === 'TEST' && trade.entry_strategy === 'FORCA_INVERTIDA' && (
                      <span className="text-[10px] text-muted-foreground">Simulado :00</span>
                    )}
                    <span className={cn("font-mono font-bold", getResultColor(trade.result))}>
                      {trade.result === 'pending' || trade.result === 'open' || trade.result === 'test_open' || trade.result === 'test7_open' ? '⏳' : trade.profit >= 0 ? `+$${trade.profit.toFixed(2)}` : `-$${Math.abs(trade.profit).toFixed(2)}`}
                    </span>
                    <Badge variant="secondary" className={cn("text-[9px] px-1 py-0", getResultColor(trade.result))}>
                      {trade.result === 'win' ? 'WIN' : trade.result === 'loss' ? 'LOSS' : trade.result === 'pending' ? 'PENDENTE' : trade.result === 'open' ? 'ABERTA' : trade.result === 'test_open' || trade.result === 'test7_open' ? 'TESTE' : trade.result.toUpperCase()}
                    </Badge>
                  </div>
                  {trade.timeframe === 'TEST' && trade.entry_strategy === 'FORCA_INVERTIDA' && (
                    <div className="basis-full flex flex-wrap items-center gap-2 border-t border-border/50 pt-1 text-[10px]">
                      <span className="text-muted-foreground">IQ Option{broker ? ` · #${broker.iq_option_id}` : ''}</span>
                      {broker ? (
                        <span className={cn('font-mono font-semibold', getResultColor(broker.result))}>
                          {broker.result === 'win' || broker.result === 'loss' || broker.result === 'tie'
                            ? `${broker.result === 'tie' ? 'EMPATE' : broker.result.toUpperCase()} · ${broker.profit >= 0 ? '+' : '-'}US$ ${Math.abs(broker.profit).toFixed(2)}`
                            : 'Aguardando resultado real'}
                        </span>
                      ) : <span className="text-muted-foreground">Sem ordem real vinculada</span>}
                    </div>
                  )}
                </div>
                );
              })}
              <div className="flex items-center justify-between pt-1.5 border-t border-border/50">
                <span className="text-xs text-muted-foreground">Total desta página</span>
                <span className={cn("text-xs font-mono font-bold", totalIqProfit >= 0 ? "text-call" : "text-put")}>
                  {totalIqProfit >= 0 ? '+' : ''}${totalIqProfit.toFixed(2)}
                </span>
              </div>
              <div className="flex items-center justify-between pt-2">
                <Button
                  size="sm" variant="secondary" className="h-7 px-2 text-xs"
                  disabled={page <= 1 || pageLoading}
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                >
                  ← Anterior
                </Button>
                <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground font-mono">
                  {pageLoading && <Loader2 className="w-3 h-3 animate-spin" />}
                  Página {page} de {Math.max(1, Math.ceil(totalCount / PAGE_SIZE))}
                </span>
                <Button
                  size="sm" variant="secondary" className="h-7 px-2 text-xs"
                  disabled={page >= Math.ceil(totalCount / PAGE_SIZE) || pageLoading}
                  onClick={() => setPage(p => p + 1)}
                >
                  Próxima →
                </Button>
              </div>
            </div>
          ) : (
            <div className="text-xs text-muted-foreground text-center py-3 bg-secondary/30 rounded-lg">
              Nenhuma operação IQ Option registrada
            </div>
          )}
        </div>

      </CardContent>
    </Card>
  );
}