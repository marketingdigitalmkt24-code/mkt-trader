import { useState, useEffect, useRef } from 'react';
import { Activity, TrendingUp, TrendingDown, Target, Clock, Server, MonitorSmartphone, Loader2 } from 'lucide-react';
import { Card, CardContent } from './ui/card';
import { Badge } from './ui/badge';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';

interface MT5Position {
  id: string;
  symbol: string;
  unrealizedProfit: number;
  volume: number;
  type: string;
  target: number;
}

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
  const [mt5Positions, setMt5Positions] = useState<MT5Position[]>([]);
  const [recentTrades, setRecentTrades] = useState<RecentTrade[]>([]);
  const [mt5Loading, setMt5Loading] = useState(true);
  const [lastMt5Check, setLastMt5Check] = useState<Date | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isFetchingRef = useRef(false);

  // Fetch MT5 positions
  const fetchMT5 = async () => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    try {
      const { data } = await supabase.functions.invoke('metaapi-monitor-positions');
      if (data?.success) {
        setMt5Positions(data.openPositions || []);
        setLastMt5Check(new Date());
      }
    } catch {
      // silent
    } finally {
      setMt5Loading(false);
      isFetchingRef.current = false;
    }
  };

  // Fetch recent IQ Option trades
  const fetchRecentTrades = async () => {
    try {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { data } = await supabase
        .from('operation_results')
        .select('id, asset, direction, result, profit, created_at, is_auto_trade, timeframe, signal_id')
        .gte('created_at', oneHourAgo)
        .order('created_at', { ascending: false })
        .limit(20);
      if (data) setRecentTrades(data as RecentTrade[]);
    } catch {
      // silent
    }
  };

  useEffect(() => {
    fetchMT5();
    fetchRecentTrades();
    pollRef.current = setInterval(() => {
      fetchMT5();
      fetchRecentTrades();
    }, 30000); // 30 segundos para evitar rate limit da MetaAPI
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

  const totalMt5Profit = mt5Positions.reduce((sum, p) => sum + p.unrealizedProfit, 0);

  const getResultColor = (result: string) => {
    if (result === 'win') return 'text-call';
    if (result === 'loss') return 'text-put';
    if (result === 'pending') return 'text-gold';
    return 'text-muted-foreground';
  };

  const getResultBg = (result: string) => {
    if (result === 'win') return 'bg-call/10';
    if (result === 'loss') return 'bg-put/10';
    if (result === 'pending') return 'bg-gold/10';
    return 'bg-secondary/50';
  };

  return (
    <Card className="border-border/50">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-4">
          <Activity className="w-5 h-5 text-primary" />
          <h3 className="text-sm font-semibold">Operações em Tempo Real</h3>
          {mt5Loading && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
        </div>

        {/* MT5 Open Positions */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <Server className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground">MT5 — Posições Abertas</span>
            </div>
            <Badge variant="secondary" className="text-[10px]">
              {mt5Positions.length} aberta{mt5Positions.length !== 1 ? 's' : ''}
            </Badge>
          </div>

          {mt5Positions.length > 0 ? (
            <div className="space-y-1.5 max-h-[400px] overflow-y-auto">
              {mt5Positions.map(pos => (
                <div key={pos.id} className={cn(
                  "flex items-center justify-between p-2 rounded-lg text-xs border",
                  pos.unrealizedProfit >= 0 ? "bg-call/5 border-call/10" : "bg-put/5 border-put/10"
                )}>
                  <div className="flex items-center gap-2">
                    {pos.type.includes('BUY') ? (
                      <TrendingUp className="w-3 h-3 text-call" />
                    ) : (
                      <TrendingDown className="w-3 h-3 text-put" />
                    )}
                    <span className="font-medium">{pos.symbol}</span>
                    <span className="text-muted-foreground">{pos.volume} lotes</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={cn(
                      "font-mono font-bold",
                      pos.unrealizedProfit >= 0 ? "text-call" : "text-put"
                    )}>
                      {pos.unrealizedProfit >= 0 ? '+' : ''}${pos.unrealizedProfit.toFixed(2)}
                    </span>
                    <div className="flex items-center gap-0.5 text-muted-foreground">
                      <Target className="w-3 h-3" />
                      <span>${pos.target.toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              ))}
              {/* MT5 Total */}
              <div className="flex items-center justify-between pt-1.5 border-t border-border/50">
                <span className="text-xs text-muted-foreground">Total P/L</span>
                <span className={cn(
                  "text-xs font-mono font-bold",
                  totalMt5Profit >= 0 ? "text-call" : "text-put"
                )}>
                  {totalMt5Profit >= 0 ? '+' : ''}${totalMt5Profit.toFixed(2)}
                </span>
              </div>
            </div>
          ) : (
            <div className="text-xs text-muted-foreground text-center py-3 bg-secondary/30 rounded-lg">
              Nenhuma posição aberta no MT5
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
              última hora
            </Badge>
          </div>

          {recentTrades.length > 0 ? (
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {recentTrades.map(trade => (
                <div key={trade.id} className={cn(
                  "flex items-center justify-between p-2 rounded-lg text-xs",
                  getResultBg(trade.result)
                )}>
                  <div className="flex items-center gap-2">
                    {trade.direction === 'CALL' || trade.direction === 'call' ? (
                      <TrendingUp className="w-3 h-3 text-call" />
                    ) : (
                      <TrendingDown className="w-3 h-3 text-put" />
                    )}
                    <span className="font-medium">{trade.asset}</span>
                    {trade.is_auto_trade && (
                      <Badge variant="outline" className="text-[9px] px-1 py-0 h-4">AUTO</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={cn("font-mono font-bold", getResultColor(trade.result))}>
                      {trade.result === 'pending' ? '⏳' : trade.profit >= 0 ? `+$${trade.profit.toFixed(2)}` : `-$${Math.abs(trade.profit).toFixed(2)}`}
                    </span>
                    <Badge
                      variant="secondary"
                      className={cn("text-[9px] px-1 py-0", getResultColor(trade.result))}
                    >
                      {trade.result === 'win' ? 'WIN' : trade.result === 'loss' ? 'LOSS' : trade.result === 'pending' ? 'PENDENTE' : trade.result.toUpperCase()}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-xs text-muted-foreground text-center py-3 bg-secondary/30 rounded-lg">
              Nenhuma operação na última hora
            </div>
          )}
        </div>

        {lastMt5Check && (
          <div className="text-[10px] text-muted-foreground text-center mt-3">
            MT5 atualizado: {lastMt5Check.toLocaleTimeString('pt-BR')}
          </div>
        )}
      </CardContent>
    </Card>
  );
}