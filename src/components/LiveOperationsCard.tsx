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
    fetchRecentTrades();
    pollRef.current = setInterval(() => {
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

  const isMt5Trade = (trade: RecentTrade) =>
    trade.timeframe === 'MT5' || trade.signal_id?.startsWith('mt5-');

  const iqTrades = recentTrades.filter(t => !isMt5Trade(t));
  const mt5ClosedTrades = recentTrades.filter(t => isMt5Trade(t));

  const totalMt5Profit = mt5Positions.reduce((sum, p) => sum + p.unrealizedProfit, 0);
  const totalMt5ClosedProfit = mt5ClosedTrades.reduce((sum, t) => sum + t.profit, 0);
  const totalIqProfit = iqTrades.reduce((sum, t) => sum + t.profit, 0);

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

          {iqTrades.length > 0 ? (
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {iqTrades.map(trade => (
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
                    <Badge variant="secondary" className={cn("text-[9px] px-1 py-0", getResultColor(trade.result))}>
                      {trade.result === 'win' ? 'WIN' : trade.result === 'loss' ? 'LOSS' : trade.result === 'pending' ? 'PENDENTE' : trade.result.toUpperCase()}
                    </Badge>
                  </div>
                </div>
              ))}
              <div className="flex items-center justify-between pt-1.5 border-t border-border/50">
                <span className="text-xs text-muted-foreground">Total IQ Option</span>
                <span className={cn("text-xs font-mono font-bold", totalIqProfit >= 0 ? "text-call" : "text-put")}>
                  {totalIqProfit >= 0 ? '+' : ''}${totalIqProfit.toFixed(2)}
                </span>
              </div>
            </div>
          ) : (
            <div className="text-xs text-muted-foreground text-center py-3 bg-secondary/30 rounded-lg">
              Nenhuma operação IQ Option na última hora
            </div>
          )}
        </div>

      </CardContent>
    </Card>
  );
}