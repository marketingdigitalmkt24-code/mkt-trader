import { TradingStats } from '@/types/trading';
import { 
  TrendingUp, 
  TrendingDown, 
  Target, 
  Flame,
  DollarSign,
  BarChart3
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Progress } from './ui/progress';

interface TradingStatsCardProps {
  stats: TradingStats;
  title?: string;
}

export function TradingStatsCard({ stats, title = "Estatísticas" }: TradingStatsCardProps) {
  const isProfitable = stats.totalProfit > 0;
  const completedSignals = stats.wins + stats.losses;
  
  return (
    <div className="glass-card p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-gold" />
          <h3 className="font-semibold">{title}</h3>
        </div>
        
        {stats.streak > 1 && (
          <div className={cn(
            'flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold',
            stats.streakType === 'win' ? 'bg-call/20 text-call' : 'bg-put/20 text-put'
          )}>
            <Flame className="w-3 h-3" />
            {stats.streak}x {stats.streakType === 'win' ? 'WIN' : 'LOSS'}
          </div>
        )}
      </div>

      {/* Win Rate Progress */}
      <div className="mb-4">
        <div className="flex items-center justify-between text-sm mb-2">
          <span className="text-muted-foreground">Win Rate</span>
          <span className={cn(
            'font-bold',
            stats.winRate >= 60 ? 'text-call' : stats.winRate >= 50 ? 'text-gold' : 'text-put'
          )}>
            {stats.winRate.toFixed(1)}%
          </span>
        </div>
        <Progress 
          value={stats.winRate} 
          className={cn(
            "h-2",
            stats.winRate >= 60 ? '[&>div]:bg-call' : stats.winRate >= 50 ? '[&>div]:bg-gold' : '[&>div]:bg-put'
          )}
        />
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-secondary/50 rounded-lg p-3 text-center">
          <div className="flex items-center justify-center gap-1 text-call mb-1">
            <TrendingUp className="w-4 h-4" />
            <span className="font-bold text-lg">{stats.wins}</span>
          </div>
          <span className="text-xs text-muted-foreground">Wins</span>
        </div>
        
        <div className="bg-secondary/50 rounded-lg p-3 text-center">
          <div className="flex items-center justify-center gap-1 text-put mb-1">
            <TrendingDown className="w-4 h-4" />
            <span className="font-bold text-lg">{stats.losses}</span>
          </div>
          <span className="text-xs text-muted-foreground">Losses</span>
        </div>
        
        <div className="bg-secondary/50 rounded-lg p-3 text-center">
          <div className="flex items-center justify-center gap-1 mb-1">
            <Target className="w-4 h-4 text-gold" />
            <span className="font-bold text-lg">{stats.totalSignals}</span>
          </div>
          <span className="text-xs text-muted-foreground">Total</span>
        </div>
        
        <div className="bg-secondary/50 rounded-lg p-3 text-center">
          <div className={cn(
            'flex items-center justify-center gap-1 mb-1',
            isProfitable ? 'text-call' : 'text-put'
          )}>
            <DollarSign className="w-4 h-4" />
            <span className="font-bold text-lg">
              {isProfitable ? '+' : ''}{stats.totalProfit.toFixed(2)}
            </span>
          </div>
          <span className="text-xs text-muted-foreground">Lucro</span>
        </div>
      </div>

      {/* Pending */}
      {stats.pending > 0 && (
        <div className="mt-3 pt-3 border-t border-border/50 text-center">
          <span className="text-xs text-muted-foreground">
            {stats.pending} {stats.pending === 1 ? 'sinal' : 'sinais'} pendente{stats.pending > 1 ? 's' : ''}
          </span>
        </div>
      )}
    </div>
  );
}
