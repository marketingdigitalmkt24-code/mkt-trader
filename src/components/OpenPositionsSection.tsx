import { Clock, Loader2, Target, TrendingDown, TrendingUp } from 'lucide-react';
import { Badge } from './ui/badge';
import { cn } from '@/lib/utils';
import { useOpenPositions } from '@/hooks/useOpenPositions';

const typeLabel = (t: string) =>
  t === 'forex' ? 'FOREX' : t === 'digital-option' ? 'DIGITAL' : t === 'turbo-option' ? 'BINÁRIA' : t === 'binary-option' ? 'BINÁRIA' : t.toUpperCase();

export function OpenPositionsSection() {
  const { openPositions, isLoading } = useOpenPositions();
  const totalOpenPnl = openPositions.reduce((sum, p) => sum + (p.pnl || 0), 0);

  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground">Operações Abertas</span>
        </div>
        <Badge variant="secondary" className="text-[10px]">{openPositions.length} abertas</Badge>
      </div>
      {isLoading ? (
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
  );
}
