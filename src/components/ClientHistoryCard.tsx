import { useState } from 'react';
import { History, Loader2, ArrowUp, ArrowDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { useClientCopyHistory } from '@/hooks/useClientCopyHistory';
import { brtDayKey, dayLabel } from '@/components/dayLabel';
import type { ClientCopyOperation } from '@/lib/client-copy-results';

interface DayGroup {
  key: string;
  label: string;
  operations: ClientCopyOperation[];
  wins: number;
  losses: number;
  profit: number;
  winRate: number;
}

function groupByDay(operations: ClientCopyOperation[]): DayGroup[] {
  const groups = new Map<string, DayGroup>();
  for (const op of operations) {
    const key = brtDayKey(op.created_at);
    const group = groups.get(key) ?? { key, label: dayLabel(op.created_at), operations: [], wins: 0, losses: 0, profit: 0, winRate: 0 };
    group.operations.push(op);
    if (op.result === 'win') group.wins++;
    if (op.result === 'loss') group.losses++;
    if (['win', 'loss', 'tie', 'draw'].includes(op.result)) group.profit += Number(op.profit || 0);
    groups.set(key, group);
  }
  const days = [...groups.values()];
  for (const day of days) {
    const settled = day.wins + day.losses;
    day.winRate = settled ? (day.wins / settled) * 100 : 0;
  }
  return days.sort((a, b) => b.operations[0].created_at.localeCompare(a.operations[0].created_at));
}

// Histórico de entradas do cliente por data (BRT), sem exibir estratégia.
export function ClientHistoryCard() {
  const { operations, isLoading, isError } = useClientCopyHistory();
  const [requestedPage, setRequestedPage] = useState(1);
  const days = groupByDay(operations);
  const totalPages = Math.max(1, days.length);
  const page = Math.min(Math.max(1, requestedPage), totalPages);
  const day = days[page - 1];

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <div className="w-7 h-7 rounded-lg bg-primary/20 flex items-center justify-center">
            <History className="w-4 h-4 text-primary" />
          </div>
          Histórico de Entradas
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : isError ? (
          <p className="text-sm text-destructive text-center py-6">Não foi possível atualizar o histórico.</p>
        ) : !day ? (
          <p className="text-sm text-muted-foreground text-center py-6">Nenhuma entrada copiada nos últimos 30 dias.</p>
        ) : (
          <>
            <div className="flex items-center justify-between gap-2 mb-3">
              <p className="text-sm font-semibold">{day.label}</p>
              <p className={cn('text-sm font-bold tabular-nums', day.profit < 0 ? 'text-put' : day.profit > 0 ? 'text-call' : 'text-muted-foreground')}>
                {day.profit >= 0 ? '+' : '−'}${Math.abs(day.profit).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2 mb-3">
              <div className="p-2 rounded-lg bg-call/10 text-center">
                <p className="text-[10px] text-muted-foreground uppercase">Wins</p>
                <p className="text-sm font-bold text-call">{day.wins}</p>
              </div>
              <div className="p-2 rounded-lg bg-put/10 text-center">
                <p className="text-[10px] text-muted-foreground uppercase">Losses</p>
                <p className="text-sm font-bold text-put">{day.losses}</p>
              </div>
              <div className="p-2 rounded-lg bg-secondary/30 text-center">
                <p className="text-[10px] text-muted-foreground uppercase">Acerto</p>
                <p className="text-sm font-bold text-call tabular-nums">{day.winRate.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%</p>
              </div>
            </div>
            <div className="space-y-1.5">
              {day.operations.map((op) => (
                <div key={op.id} className="flex items-center justify-between p-2 rounded-lg bg-secondary/20">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className={cn(
                      'w-6 h-6 rounded flex items-center justify-center shrink-0',
                      op.direction === 'CALL' ? 'bg-call/20 text-call' : 'bg-put/20 text-put'
                    )}>
                      {op.direction === 'CALL' ? <ArrowUp className="w-3.5 h-3.5" /> : <ArrowDown className="w-3.5 h-3.5" />}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-medium truncate">{op.asset}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {new Date(op.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })} · #{op.iq_option_id}
                      </p>
                    </div>
                  </div>
                  <span className={cn(
                    'text-xs font-bold shrink-0',
                    op.result === 'win' ? 'text-call' : op.result === 'loss' ? 'text-put' : 'text-muted-foreground'
                  )}>
                    {op.result === 'win' ? `+$${Number(op.profit).toFixed(2)}` : op.result === 'loss' ? `-$${Math.abs(Number(op.profit)).toFixed(2)}` : ['tie', 'draw'].includes(op.result) ? 'Empate' : 'Em aberto'}
                  </span>
                </div>
              ))}
            </div>
            {days.length > 1 && (
              <nav aria-label="Histórico por data" className="flex items-center justify-between gap-2 mt-3">
                <Button variant="outline" size="icon" aria-label="Dia mais recente" title="Dia mais recente" disabled={page === 1} onClick={() => setRequestedPage(page - 1)}>
                  <ChevronLeft />
                </Button>
                <span className="text-xs text-muted-foreground tabular-nums">{page} de {totalPages} dias</span>
                <Button variant="outline" size="icon" aria-label="Dia anterior" title="Dia anterior" disabled={page === totalPages} onClick={() => setRequestedPage(page + 1)}>
                  <ChevronRight />
                </Button>
              </nav>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
