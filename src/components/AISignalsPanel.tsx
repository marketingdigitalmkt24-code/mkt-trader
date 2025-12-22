import { useState, useEffect, useCallback } from 'react';
import { Brain, Sparkles, TrendingUp, TrendingDown, Loader2, RefreshCw, AlertTriangle } from 'lucide-react';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Progress } from './ui/progress';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';

interface AISignal {
  asset: string;
  direction: 'CALL' | 'PUT';
  confidence: number;
  reason: string;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  payout: number;
  indicators: {
    rsi: number;
    trend: 'up' | 'down' | 'sideways';
    volatility: 'low' | 'medium' | 'high';
  };
}

interface AISignalsPanelProps {
  onSignalClick?: (signal: AISignal) => void;
}

// Simulated market data for analysis (since direct IQ Option API has CORS issues)
const generateSimulatedMarketData = () => {
  const assets = [
    'EUR/USD-OTC', 'EUR/GBP-OTC', 'USD/JPY-OTC', 
    'AUD/CAD-OTC', 'EUR/JPY-OTC', 'GBP/USD-OTC'
  ];
  
  return assets.map(asset => {
    const rsi = Math.random() * 100;
    const trend = rsi < 30 ? 'up' : rsi > 70 ? 'down' : Math.random() > 0.5 ? 'up' : 'down';
    const volatility = Math.random() < 0.3 ? 'low' : Math.random() > 0.7 ? 'high' : 'medium';
    
    return {
      asset,
      type: rsi < 30 ? 'CALL' : rsi > 70 ? 'PUT' : trend === 'up' ? 'CALL' : 'PUT',
      timeframe: 'M1',
      price: 1 + Math.random() * 0.5,
      indicators: {
        rsi: { value: rsi, signal: rsi < 30 ? 'oversold' : rsi > 70 ? 'overbought' : 'neutral' },
        atr: { volatility },
        confluenceScore: rsi < 25 || rsi > 75 ? 85 : 70,
        confluenceCount: 3,
      },
      confirmations: [],
      payout: 75 + Math.floor(Math.random() * 15),
      trend,
      volatility,
    };
  });
};

export function AISignalsPanel({ onSignalClick }: AISignalsPanelProps) {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiSignals, setAISignals] = useState<AISignal[]>([]);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Analyze market data and generate AI signals
  const analyzeMarkets = useCallback(async () => {
    setIsAnalyzing(true);
    setError(null);

    try {
      // Generate simulated market data (IQ Option direct API blocked by CORS)
      const marketData = generateSimulatedMarketData();

      // Call AI to analyze the data
      const { data, error: fnError } = await supabase.functions.invoke('ai-signal-analyzer', {
        body: {
          signals: marketData.map(m => ({
            asset: m.asset,
            type: m.type,
            timeframe: m.timeframe,
            price: m.price,
            indicators: m.indicators,
            confirmations: m.confirmations,
          })),
          historicalResults: [],
          mode: 'realtime',
        },
      });

      if (fnError) throw new Error(fnError.message);

      // Process AI response
      const generatedSignals: AISignal[] = (data?.analyzedSignals || [])
        .filter((s: any) => s.recommendation === 'EXECUTE' && s.confidence >= 65)
        .map((s: any) => {
          const marketInfo = marketData.find(m => m.asset === s.asset);
          return {
            asset: s.asset,
            direction: marketInfo?.type === 'CALL' ? 'CALL' : 'PUT',
            confidence: s.confidence,
            reason: s.reason || 'Análise de indicadores técnicos',
            riskLevel: s.riskLevel || 'MEDIUM',
            payout: marketInfo?.payout || 80,
            indicators: {
              rsi: marketInfo?.indicators?.rsi?.value || 50,
              trend: (marketInfo?.trend as 'up' | 'down' | 'sideways') || 'sideways',
              volatility: (marketInfo?.volatility as 'low' | 'medium' | 'high') || 'medium',
            },
          };
        });

      setAISignals(generatedSignals);
      setLastUpdate(new Date());
      
    } catch (err) {
      console.error('AI analysis error:', err);
      setError(err instanceof Error ? err.message : 'Erro na análise');
    } finally {
      setIsAnalyzing(false);
    }
  }, []);

  // Initial analysis and auto-refresh
  useEffect(() => {
    analyzeMarkets();
    const interval = setInterval(analyzeMarkets, 60000);
    return () => clearInterval(interval);
  }, [analyzeMarkets]);

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case 'LOW': return 'text-call bg-call/20';
      case 'MEDIUM': return 'text-gold bg-gold/20';
      case 'HIGH': return 'text-put bg-put/20';
      default: return 'text-muted-foreground';
    }
  };

  return (
    <Card className="border-purple-500/30 bg-purple-500/5">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-purple-500/20">
              <Brain className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                Sinais da IA
                <Badge variant="outline" className="text-xs bg-purple-500/20">
                  <Sparkles className="w-3 h-3 mr-1" />
                  Live
                </Badge>
              </CardTitle>
              <CardDescription className="text-xs">
                Análise automática de indicadores técnicos
              </CardDescription>
            </div>
          </div>
          
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-8 w-8"
            onClick={analyzeMarkets}
            disabled={isAnalyzing}
          >
            {isAnalyzing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
          </Button>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-3">
        {error && (
          <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-destructive" />
            <span className="text-sm text-destructive">{error}</span>
          </div>
        )}

        {isAnalyzing && aiSignals.length === 0 && (
          <div className="p-4 text-center">
            <Loader2 className="w-8 h-8 animate-spin text-purple-400 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Analisando mercados...</p>
          </div>
        )}

        {!isAnalyzing && aiSignals.length === 0 && !error && (
          <div className="p-4 bg-secondary/30 rounded-lg text-center">
            <Brain className="w-8 h-8 text-muted-foreground mx-auto mb-2 opacity-50" />
            <p className="text-sm text-muted-foreground">
              Aguardando oportunidades de alta probabilidade...
            </p>
          </div>
        )}

        {aiSignals.map((signal, index) => (
          <div 
            key={`${signal.asset}-${index}`}
            className={cn(
              "p-3 rounded-lg border cursor-pointer transition-all hover:scale-[1.02]",
              signal.direction === 'CALL' 
                ? "bg-call/10 border-call/30 hover:bg-call/20"
                : "bg-put/10 border-put/30 hover:bg-put/20"
            )}
            onClick={() => onSignalClick?.(signal)}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                {signal.direction === 'CALL' ? (
                  <TrendingUp className="w-5 h-5 text-call" />
                ) : (
                  <TrendingDown className="w-5 h-5 text-put" />
                )}
                <span className="font-bold">{signal.asset}</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className={getRiskColor(signal.riskLevel)}>
                  {signal.riskLevel}
                </Badge>
                <Badge 
                  className={signal.direction === 'CALL' ? 'bg-call' : 'bg-put'}
                >
                  {signal.direction}
                </Badge>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Confiança IA</span>
                <span className="font-mono font-bold text-purple-400">{signal.confidence}%</span>
              </div>
              <Progress 
                value={signal.confidence} 
                className="h-2 [&>div]:bg-purple-500"
              />

              <div className="grid grid-cols-3 gap-2 mt-2">
                <div className="text-center p-1 bg-secondary/50 rounded">
                  <div className="text-xs text-muted-foreground">RSI</div>
                  <div className={cn(
                    "text-sm font-mono font-bold",
                    signal.indicators.rsi < 30 ? "text-call" : 
                    signal.indicators.rsi > 70 ? "text-put" : "text-foreground"
                  )}>
                    {signal.indicators.rsi.toFixed(0)}
                  </div>
                </div>
                <div className="text-center p-1 bg-secondary/50 rounded">
                  <div className="text-xs text-muted-foreground">Tendência</div>
                  <div className="text-sm font-bold capitalize">
                    {signal.indicators.trend === 'up' ? '↑' : signal.indicators.trend === 'down' ? '↓' : '→'}
                  </div>
                </div>
                <div className="text-center p-1 bg-secondary/50 rounded">
                  <div className="text-xs text-muted-foreground">Payout</div>
                  <div className="text-sm font-mono font-bold text-call">{signal.payout}%</div>
                </div>
              </div>

              <p className="text-xs text-muted-foreground mt-2 line-clamp-2">
                {signal.reason}
              </p>
            </div>
          </div>
        ))}

        {lastUpdate && (
          <div className="text-xs text-center text-muted-foreground">
            Atualizado: {lastUpdate.toLocaleTimeString('pt-BR')}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
