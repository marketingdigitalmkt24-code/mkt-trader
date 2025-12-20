import { TradingSignal } from '@/types/trading';
import { Flame, TrendingUp, TrendingDown, Clock } from 'lucide-react';

interface QuickStatsProps {
  signals: TradingSignal[];
}

export function QuickStats({ signals }: QuickStatsProps) {
  const hotCount = signals.filter((s) => s.isHot).length;
  const callCount = signals.filter((s) => s.type === 'CALL').length;
  const putCount = signals.filter((s) => s.type === 'PUT').length;

  const stats = [
    {
      icon: Flame,
      label: 'Hot Signals',
      value: hotCount,
      color: 'text-gold bg-gold/10',
    },
    {
      icon: TrendingUp,
      label: 'CALL',
      value: callCount,
      color: 'text-call bg-call/10',
    },
    {
      icon: TrendingDown,
      label: 'PUT',
      value: putCount,
      color: 'text-put bg-put/10',
    },
    {
      icon: Clock,
      label: 'Total',
      value: signals.length,
      color: 'text-muted-foreground bg-secondary',
    },
  ];

  return (
    <div className="grid grid-cols-4 gap-3 mb-6">
      {stats.map((stat) => (
        <div
          key={stat.label}
          className="glass-card p-3 flex flex-col items-center justify-center"
        >
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-2 ${stat.color}`}>
            <stat.icon className="w-4 h-4" />
          </div>
          <div className="text-2xl font-bold font-mono">{stat.value}</div>
          <div className="text-xs text-muted-foreground">{stat.label}</div>
        </div>
      ))}
    </div>
  );
}
