import { AssetPerformance } from '@/types/trading';
import { Trophy, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AssetRankingProps {
  assets: AssetPerformance[];
}

export function AssetRanking({ assets }: AssetRankingProps) {
  const getTrendIcon = (trend: 'up' | 'down' | 'neutral') => {
    switch (trend) {
      case 'up':
        return <TrendingUp className="w-4 h-4 text-call" />;
      case 'down':
        return <TrendingDown className="w-4 h-4 text-put" />;
      default:
        return <Minus className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const getWinRateColor = (rate: number) => {
    if (rate >= 70) return 'text-call';
    if (rate >= 60) return 'text-gold';
    return 'text-muted-foreground';
  };

  return (
    <section className="glass-card p-4">
      <div className="flex items-center gap-2 mb-4">
        <Trophy className="w-5 h-5 text-gold" />
        <h3 className="font-semibold text-foreground">Ranking de Ativos</h3>
      </div>

      <div className="space-y-2">
        {assets.map((asset, index) => (
          <div
            key={asset.asset}
            className={cn(
              'flex items-center justify-between p-3 rounded-lg transition-colors',
              index === 0 ? 'bg-gold/10 border border-gold/20' : 'bg-secondary/50 hover:bg-secondary'
            )}
          >
            <div className="flex items-center gap-3">
              <span
                className={cn(
                  'w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold',
                  index === 0 ? 'bg-gold text-background' : 'bg-muted text-muted-foreground'
                )}
              >
                {index + 1}
              </span>
              <span className="text-xl">{asset.icon}</span>
              <div>
                <div className="font-medium text-sm">{asset.asset}</div>
                <div className="text-xs text-muted-foreground">
                  {asset.totalSignals} sinais
                </div>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="text-right">
                <div className={cn('font-mono font-bold', getWinRateColor(asset.winRate))}>
                  {asset.winRate}%
                </div>
                <div className="text-xs text-muted-foreground">win rate</div>
              </div>
              <div className="flex items-center gap-1">
                {getTrendIcon(asset.trend)}
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
