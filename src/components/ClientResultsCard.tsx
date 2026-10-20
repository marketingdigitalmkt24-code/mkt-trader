import { useState } from 'react';
import { BarChart3, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { useClientCopyHistory } from '@/hooks/useClientCopyHistory';
import { copyResultRates } from '@/lib/admin-copy-results';
import { clientDayStart } from '@/lib/client-copy-results';
import { brtDayKey, dayLabel } from '@/components/dayLabel';

const PAGE_SIZE = 12;
const SETTLED = ['win', 'loss', 'draw', 'tie'];

// Histórico do cliente no mesmo formato do card "Entradas na IQ Option" do admin; nunca exibe a estratégia.
export function ClientResultsCard() {
  const { operations, isLoading, isError } = useClientCopyHistory();
  const [page, setPage] = useState(0);

  const todayStart = clientDayStart();
  const todayOps = operations.filter(op => op.created_at >= todayStart);
  const wins = todayOps.filter(op => op.result === 'win').length;
  const losses = todayOps.filter(op => op.result === 'loss').length;
  const total = todayOps.filter(op => SETTLED.includes(op.result)).reduce((s, op) => s + Number(op.profit || 0), 0);
  const { winPercent } = copyResultRates(wins, losses);

  const pageCount = Math.max(1, Math.ceil(operations.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageOps = operations.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  const scoreFor = (iso: string) => {
    const key = brtDayKey(iso);
    const dayOps = operations.filter(o => brtDayKey(o.created_at) === key);
    const w = dayOps.filter(o => o.result === 'win').length;
    const l = dayOps.filter(o => o.result === 'loss').length;
    const p = dayOps.filter(o => SETTLED.includes(o.result)).reduce((s, o) => s + Number(o.profit || 0), 0);
    return { w, l, pct: w + l ? Math.round((w / (w + l)) * 100) : 0, p };
  };

  return (
    <Card className="p-3 sm:p-4 border-border/50">
      <div className="flex items-center gap-2 mb-2">
        <BarChart3 className="w-4 h-4 text-primary" />
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Entradas na IQ Option (hoje)</span>
        <span className="font-mono text-xs ml-auto mr-2">
          <span className="text-call">✓{wins}</span> <span className="text-put">✗{losses}</span>{' '}
          <span className="text-gold">{winPercent.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}%</span>
        </span>
        <span className={cn('font-mono text-sm font-bold', total >= 0 ? 'text-call' : 'text-put')}>
          {total >= 0 ? '+' : '−'}US$ {Math.abs(total).toFixed(2)}
        </span>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
      ) : isError ? (
        <p className="text-xs text-destructive py-4 text-center">Não foi possível atualizar as entradas.</p>
      ) : operations.length === 0 ? (
        <p className="text-xs text-muted-foreground py-4 text-center">Nenhuma operação copiada ainda.</p>
      ) : (
        <>
          <div className="space-y-1">
            {pageOps.map((o, i) => (
              <div key={o.id}>
                {(i === 0 || brtDayKey(pageOps[i - 1].created_at) !== brtDayKey(o.created_at)) && (() => {
                  const s = scoreFor(o.created_at);
                  return (
                    <div className="flex items-center justify-between pt-2 pb-0.5">
                      <div className="text-[10px] font-semibold uppercase tracking-wider text-gold">{dayLabel(o.created_at)}</div>
                      <div className="font-mono text-[10px]">
                        <span className="text-call">✓{s.w}</span> <span className="text-put">✗{s.l}</span> <span className="text-gold">{s.pct}%</span>{' '}
                        <span className={s.p >= 0 ? 'text-call' : 'text-put'}>{s.p >= 0 ? '+' : '−'}{Math.abs(s.p).toFixed(2)}</span>
                      </div>
                    </div>
                  );
                })()}
                <div className="flex items-center justify-between text-xs border-b border-border/50 py-1 gap-1">
                  <span className="font-mono text-muted-foreground">
                    {new Date(o.created_at).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <span className="flex-1 ml-1 min-w-0 flex flex-col leading-tight">
                    <span className="font-medium truncate">{o.asset}</span>
                    <span className="font-mono text-[9px] text-muted-foreground truncate">#{o.iq_option_id}</span>
                  </span>
                  <span className={o.direction === 'CALL' ? 'text-call' : 'text-put'}>{o.direction}</span>
                  <span className="ml-1 w-16 text-right font-mono">
                    {o.result === 'win' ? <span className="text-call">+{Number(o.profit).toFixed(2)}</span>
                      : o.result === 'loss' ? <span className="text-put">{Number(o.profit).toFixed(2)}</span>
                      : ['tie', 'draw'].includes(o.result) ? <span className="text-muted-foreground">empate</span>
                      : <span className="text-muted-foreground">aberta</span>}
                  </span>
                </div>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between mt-2">
            <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>
              <ChevronLeft className="h-3 w-3 mr-1" /> Anterior
            </Button>
            <span className="text-[10px] text-muted-foreground font-mono">{safePage + 1}/{pageCount}</span>
            <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" disabled={safePage >= pageCount - 1} onClick={() => setPage(safePage + 1)}>
              Próxima <ChevronRight className="h-3 w-3 ml-1" />
            </Button>
          </div>
        </>
      )}
    </Card>
  );
}
