import { Brain, Loader2, CheckCircle, XCircle, Zap, Clock } from 'lucide-react';
import { Badge } from './ui/badge';
import { Card, CardContent } from './ui/card';
import { cn } from '@/lib/utils';

interface AIStatusIndicatorProps {
  isAutoTradingEnabled: boolean;
  isAIEnabled: boolean;
  isAnalyzing: boolean;
  isPlacingTrade: boolean;
  activeTradesCount: number;
  todayTrades: number;
  maxDailyTrades: number;
  lastAnalysisResult?: {
    approved: number;
    rejected: number;
    timestamp: Date;
  };
}

export function AIStatusIndicator({
  isAutoTradingEnabled,
  isAIEnabled,
  isAnalyzing,
  isPlacingTrade,
  activeTradesCount,
  todayTrades,
  maxDailyTrades,
  lastAnalysisResult,
}: AIStatusIndicatorProps) {
  const getStatusColor = () => {
    if (!isAutoTradingEnabled) return 'bg-muted text-muted-foreground';
    if (isAnalyzing) return 'bg-blue-500/20 text-blue-400 border-blue-500/50';
    if (isPlacingTrade) return 'bg-gold/20 text-gold border-gold/50';
    if (isAIEnabled) return 'bg-call/20 text-call border-call/50';
    return 'bg-muted text-muted-foreground';
  };

  const getStatusText = () => {
    if (!isAutoTradingEnabled) return 'Auto Trading Desativado';
    if (isAnalyzing) return 'IA Analisando Sinais...';
    if (isPlacingTrade) return `Executando ${activeTradesCount} Trade(s)...`;
    if (isAIEnabled) return 'Aguardando Sinais';
    return 'IA Desativada';
  };

  const getStatusIcon = () => {
    if (isAnalyzing) return <Loader2 className="w-4 h-4 animate-spin" />;
    if (isPlacingTrade) return <Zap className="w-4 h-4 animate-pulse" />;
    if (isAutoTradingEnabled && isAIEnabled) return <Brain className="w-4 h-4" />;
    return <Clock className="w-4 h-4" />;
  };

  return (
    <Card className={cn(
      "border transition-all duration-300",
      getStatusColor()
    )}>
      <CardContent className="p-3 sm:p-4">
        <div className="flex items-center justify-between gap-3">
          {/* Status Principal */}
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <div className={cn(
              "flex items-center justify-center w-8 h-8 sm:w-10 sm:h-10 rounded-lg",
              isAutoTradingEnabled && isAIEnabled ? "bg-primary/20" : "bg-muted"
            )}>
              {getStatusIcon()}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm sm:text-base truncate">
                  {getStatusText()}
                </span>
                {isAnalyzing && (
                  <span className="w-2 h-2 bg-blue-400 rounded-full animate-pulse" />
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {todayTrades}/{maxDailyTrades} trades hoje
              </p>
            </div>
          </div>

          {/* Badges de Status */}
          <div className="flex items-center gap-1 sm:gap-2 shrink-0">
            <Badge 
              variant={isAutoTradingEnabled ? "default" : "secondary"}
              className={cn(
                "text-xs",
                isAutoTradingEnabled && "bg-call text-call-foreground"
              )}
            >
              {isAutoTradingEnabled ? "AUTO ON" : "AUTO OFF"}
            </Badge>
            <Badge 
              variant={isAIEnabled ? "default" : "secondary"}
              className={cn(
                "text-xs hidden xs:inline-flex",
                isAIEnabled && isAutoTradingEnabled && "bg-primary text-primary-foreground"
              )}
            >
              {isAIEnabled ? "IA ON" : "IA OFF"}
            </Badge>
          </div>
        </div>

        {/* Última Análise */}
        {lastAnalysisResult && isAutoTradingEnabled && (
          <div className="mt-3 pt-3 border-t border-border/50">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Última análise:</span>
              <div className="flex items-center gap-2">
                <span className="flex items-center gap-1 text-call">
                  <CheckCircle className="w-3 h-3" />
                  {lastAnalysisResult.approved} aprovados
                </span>
                <span className="flex items-center gap-1 text-destructive">
                  <XCircle className="w-3 h-3" />
                  {lastAnalysisResult.rejected} rejeitados
                </span>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
