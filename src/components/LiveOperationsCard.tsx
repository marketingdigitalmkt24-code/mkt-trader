import { useState, useEffect, useRef } from 'react';
import { Activity, TrendingUp, TrendingDown, Target, Clock, Server, MonitorSmartphone, Loader2 } from 'lucide-react';
import { Card, CardContent } from './ui/card';
import { Badge } from './ui/badge';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';

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
}

export function LiveOperationsCard() {
  const PAGE_SIZE = 10;
  const [recentTrades, setRecentTrades] = useState<RecentTrade[]>([]);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const pageRef = useRef(1);
  const [openPositions, setOpenPositions] = useState<OpenPosition[]>([]);
  const [openLoading, setOpenLoading] = useState(true);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isFetchingRef = useRef(false);

  // Posições abertas na IQ Option (binária, digital e forex)
  const fetchOpen = async () => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    try {
      const { data } = await supabase.functions.invoke('iqoption-open-positions');
      if (data?.success) setOpenPositions(data.positions || []);
    } catch {
      // silent
    } finally {
      setOpenLoading(false);
      isFetchingRef.current = false;
    }
  };

  // Fetch IQ Option trades (paginated, 10 per page, all time)
  const fetchRecentTrades = async () => {
    try {
      const from = (pageRef.current - 1) * PAGE_SIZE;
      const { data, count } = await supabase
        .from('operation_results')
        .select('id, asset, direction, result, profit, created_at, is_auto_trade, timeframe, signal_id', { count: 'exact' })
        .or('timeframe.is.null,timeframe.neq.MT5')
        .order('created_at', { ascending: false })
        .range(from, from + PAGE_SIZE - 1);
      if (data) setRecentTrades(data as RecentTrade[]);
      if (typeof count === 'number') setTotalCount(count);
    } catch {
      // silent
    }
  };

  useEffect(() => {
    pageRef.current = page;
    fetchRecentTrades();
  }, [page]);

  useEffect(() => {
    fetchRecentTrades();
    fetchOpen();
    pollRef.current = setInterval(() => {
      fetchRecentTrades();
      fetchOpen();
    }, 15000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  // Subscribe to realtime operation_results
  useEffect(() => {
    const channel = supabase
      .channel('live-ops')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'operation_results' }, () => {
        fetchRecentTrades();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const isMt5Trade = (trade: RecentTrade) =>
    trade.timeframe === 'MT5' || trade.signal_id?.startsWith('mt5-');

  const iqTrades = recentTrades.filter(t => !isMt5Trade(t));
  const totalOpenPnl = openPositions.reduce((sum, p) => sum + (p.pnl || 0), 0);
  const totalIqProfit = iqTrades.reduce((sum, t) => sum + t.profit, 0);

  const getResultColor = (result: string) => {
    if (result === 'win') return 'text-call';
    if (result === 'loss') return 'text-put';
    if (result === 'pending' || result === 'open') return 'text-gold';
    return 'text-muted-foreground';
  };

  const getResultBg = (result: string) => {
    if (result === 'win') return 'bg-call/10';
    if (result === 'loss') return 'bg-put/10';
    if (result === 'pending' || result === 'open') return 'bg-gold/10';
    return 'bg-secondary/50';
  };

  return (
    <Card className="border-border/50">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-4">
          <Activity className="w-5 h-5 text-primary" />
          <h3 className="text-sm font-semibold">Operações em Tempo Real</h3>
          
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
            <Badge variant="secondary" className="text-[10px]">
              {totalCount} no total
            </Badge>
          </div>

          {iqTrades.length > 0 ? (
            <div className="space-y-1">
              {iqTrades.map(trade => (
                <div key={trade.id} className={cn(
                  "flex items-center justify-between p-2 rounded-lg text-xs",
                  getResultBg(trade.result)
                )}>
                  <div className="flex items-center gap-2 min-w-0">
                    {trade.direction === 'CALL' || trade.direction === 'call' ? (
                      <TrendingUp className="w-3 h-3 text-call shrink-0" />
                    ) : (
                      <TrendingDown className="w-3 h-3 text-put shrink-0" />
                    )}
                    <span className="font-medium">{trade.asset}</span>
                    <span className="text-[10px] text-muted-foreground font-mono">
                      {new Date(trade.created_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </span>
                    {trade.timeframe === 'FOREX' && (
                      <Badge variant="outline" className="text-[9px] px-1 py-0 h-4">FOREX</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={cn("font-mono font-bold", getResultColor(trade.result))}>
                      {trade.result === 'pending' || trade.result === 'open' ? '⏳' : trade.profit >= 0 ? `+$${trade.profit.toFixed(2)}` : `-$${Math.abs(trade.profit).toFixed(2)}`}
                    </span>
                    <Badge variant="secondary" className={cn("text-[9px] px-1 py-0", getResultColor(trade.result))}>
                      {trade.result === 'win' ? 'WIN' : trade.result === 'loss' ? 'LOSS' : trade.result === 'pending' ? 'PENDENTE' : trade.result === 'open' ? 'ABERTA' : trade.result.toUpperCase()}
                    </Badge>
                  </div>
                </div>
              ))}
              <div className="flex items-center justify-between pt-1.5 border-t border-border/50">
                <span className="text-xs text-muted-foreground">Total desta página</span>
                <span className={cn("text-xs font-mono font-bold", totalIqProfit >= 0 ? "text-call" : "text-put")}>
                  {totalIqProfit >= 0 ? '+' : ''}${totalIqProfit.toFixed(2)}
                </span>
              </div>
              <div className="flex items-center justify-between pt-2">
                <button
                  className="text-xs px-2 py-1 rounded-md bg-secondary disabled:opacity-40"
                  disabled={page <= 1}
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                >
                  ← Anterior
                </button>
                <span className="text-[10px] text-muted-foreground font-mono">
                  Página {page} de {Math.max(1, Math.ceil(totalCount / PAGE_SIZE))}
                </span>
                <button
                  className="text-xs px-2 py-1 rounded-md bg-secondary disabled:opacity-40"
                  disabled={page >= Math.ceil(totalCount / PAGE_SIZE)}
                  onClick={() => setPage(p => p + 1)}
                >
                  Próxima →
                </button>
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