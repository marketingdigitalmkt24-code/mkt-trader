import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DailyResult } from '@/hooks/useDailyHistory';

interface DailyHistoryListProps {
  history: DailyResult[];
  formatCurrency: (value: number) => string;
}

export function DailyHistoryList({ history, formatCurrency }: DailyHistoryListProps) {
  if (history.length === 0) return null;

  const formatDate = (dateStr: string) => {
    const [year, month, day] = dateStr.split('-');
    return `${day}/${month}`;
  };

  const getDayLabel = (dateStr: string) => {
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
    const yesterday = new Date(Date.now() - 86400000).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
    
    if (dateStr === today) return 'Hoje';
    if (dateStr === yesterday) return 'Ontem';
    
    const date = new Date(dateStr + 'T12:00:00');
    const weekday = date.toLocaleDateString('pt-BR', { weekday: 'short' });
    return weekday.charAt(0).toUpperCase() + weekday.slice(1).replace('.', '');
  };

  return (
    <div className="mt-4">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold mb-2">
        Histórico por Dia
      </div>
      <div className="space-y-1.5">
        {history.map((day) => {
          const isProfit = day.profit >= 0;
          return (
            <div
              key={day.date}
              className={cn(
                "flex items-center justify-between p-2 rounded-lg border text-xs",
                isProfit
                  ? "bg-call/5 border-call/15"
                  : "bg-put/5 border-put/15"
              )}
            >
              <div className="flex items-center gap-2">
                <div className={cn(
                  "w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0",
                  isProfit ? "bg-call/20" : "bg-put/20"
                )}>
                  {day.profit === 0 ? (
                    <Minus className="w-3 h-3 text-muted-foreground" />
                  ) : isProfit ? (
                    <TrendingUp className="w-3 h-3 text-call" />
                  ) : (
                    <TrendingDown className="w-3 h-3 text-put" />
                  )}
                </div>
                <div>
                  <div className="font-semibold text-foreground">
                    {getDayLabel(day.date)} <span className="text-muted-foreground font-normal">{formatDate(day.date)}</span>
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    {day.trades} trades · <span className="text-call">{day.wins}W</span> · <span className="text-put">{day.losses}L</span>
                    {day.ties > 0 && <> · {day.ties}T</>}
                    {' · '}{day.winRate.toFixed(0)}%
                  </div>
                </div>
              </div>
              <div className={cn(
                "font-bold font-mono text-sm",
                isProfit ? "text-call" : "text-put"
              )}>
                {isProfit ? '+' : ''}{formatCurrency(day.profit)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
