import { Brain, TrendingUp, TrendingDown, Clock, BarChart3 } from 'lucide-react';
import { useAILearningMetrics } from '@/hooks/useAILearningMetrics';

export function AILearningCard() {
  const metrics = useAILearningMetrics();

  if (metrics.isLoading) {
    return (
      <div className="glass-card p-4 animate-pulse">
        <div className="h-5 bg-muted/30 rounded w-2/3 mb-3" />
        <div className="space-y-2">
          <div className="h-4 bg-muted/20 rounded w-full" />
          <div className="h-4 bg-muted/20 rounded w-3/4" />
        </div>
      </div>
    );
  }

  if (metrics.totalTrades === 0) {
    return (
      <div className="glass-card p-4">
        <div className="flex items-center gap-2 mb-2">
          <Brain className="w-4 h-4 text-purple-400" />
          <h3 className="text-sm font-semibold text-foreground">IA Aprendizado</h3>
        </div>
        <p className="text-xs text-muted-foreground">
          Sem dados ainda. A IA começa a aprender após as primeiras operações.
        </p>
      </div>
    );
  }

  const profitColor = metrics.totalProfit >= 0 ? 'text-green-400' : 'text-red-400';
  const wrColor = metrics.overallWinRate >= 55 ? 'text-green-400' : metrics.overallWinRate >= 45 ? 'text-yellow-400' : 'text-red-400';

  return (
    <div className="glass-card p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Brain className="w-4 h-4 text-purple-400" />
          <h3 className="text-sm font-semibold text-foreground">IA Aprendizado</h3>
        </div>
        <span className="text-[10px] text-muted-foreground bg-secondary/50 px-2 py-0.5 rounded-full">14 dias</span>
      </div>

      {/* Main Stats */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-secondary/30 rounded-lg p-2 text-center">
          <div className="flex items-center justify-center gap-1 mb-0.5">
            <BarChart3 className="w-3 h-3 text-muted-foreground" />
          </div>
          <p className="text-lg font-bold text-foreground">{metrics.totalTrades}</p>
          <p className="text-[10px] text-muted-foreground">Trades</p>
        </div>
        <div className="bg-secondary/30 rounded-lg p-2 text-center">
          <div className="flex items-center justify-center gap-1 mb-0.5">
            <TrendingUp className="w-3 h-3 text-muted-foreground" />
          </div>
          <p className={`text-lg font-bold ${wrColor}`}>{metrics.overallWinRate}%</p>
          <p className="text-[10px] text-muted-foreground">Win Rate</p>
        </div>
        <div className="bg-secondary/30 rounded-lg p-2 text-center">
          <div className="flex items-center justify-center gap-1 mb-0.5">
            {metrics.totalProfit >= 0 ? (
              <TrendingUp className="w-3 h-3 text-green-400" />
            ) : (
              <TrendingDown className="w-3 h-3 text-red-400" />
            )}
          </div>
          <p className={`text-lg font-bold ${profitColor}`}>${metrics.totalProfit.toFixed(0)}</p>
          <p className="text-[10px] text-muted-foreground">Lucro</p>
        </div>
      </div>

      {/* Top Assets */}
      {metrics.topAssets.length > 0 && (
        <div>
          <p className="text-[11px] font-medium text-muted-foreground mb-1.5">🏆 Melhores Ativos</p>
          <div className="space-y-1">
            {metrics.topAssets.map((a) => (
              <div key={a.asset} className="flex items-center justify-between bg-green-500/5 rounded px-2 py-1">
                <span className="text-xs font-medium text-foreground">{a.asset}</span>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-green-400">{a.winRate}%</span>
                  <span className="text-[10px] text-green-400">${a.profit}</span>
                  <span className="text-[10px] text-muted-foreground">{a.trades}t</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Worst Assets */}
      {metrics.worstAssets.length > 0 && (
        <div>
          <p className="text-[11px] font-medium text-muted-foreground mb-1.5">⛔ Ativos Bloqueados</p>
          <div className="space-y-1">
            {metrics.worstAssets.map((a) => (
              <div key={a.asset} className="flex items-center justify-between bg-red-500/5 rounded px-2 py-1">
                <span className="text-xs font-medium text-foreground">{a.asset}</span>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-red-400">{a.winRate}%</span>
                  <span className="text-[10px] text-red-400">${a.profit}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Best Hours */}
      {metrics.bestHours.length > 0 && (
        <div className="flex items-center gap-1.5">
          <Clock className="w-3 h-3 text-muted-foreground" />
          <span className="text-[11px] text-muted-foreground">Melhores horários:</span>
          <span className="text-[11px] font-medium text-foreground">
            {metrics.bestHours.map(h => `${h}h`).join(', ')} UTC
          </span>
        </div>
      )}
    </div>
  );
}
