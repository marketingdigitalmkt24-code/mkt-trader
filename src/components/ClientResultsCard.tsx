import { useState } from 'react';
import { BarChart3, Loader2, ArrowUp, ArrowDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useClientCopyHistory } from '@/hooks/useClientCopyHistory';
import { copyResultRates } from '@/lib/admin-copy-results';
import { clientSignalsPage, clientDayStart } from '@/lib/client-copy-results';
import { brtDayKey, dayLabel } from '@/components/dayLabel';
import type { ClientCopyOperation } from '@/lib/client-copy-results';

function OperationRow({ op }: { op: ClientCopyOperation }) {
  return (
    <div className="flex items-center justify-between p-2 rounded-lg bg-secondary/20">
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
  );
}

// Resultados do cliente: hoje em destaque + histórico por data; nunca exibe a estratégia utilizada.
export function ClientResultsCard() {
  const { operations, isLoading, isError } = useClientCopyHistory();
  const [requestedPage, setRequestedPage] = useState(1);
  const [requestedDay, setRequestedDay] = useState(1);

  const todayStart = clientDayStart();
  const todayOps = operations.filter(op => op.created_at >= todayStart);
  const wins = todayOps.filter(op => op.result === 'win').length;
  const losses = todayOps.filter(op => op.result === 'loss').length;
  const trades = todayOps.filter(op => ['win', 'loss', 'draw', 'tie'].includes(op.result)).length;
  const profit = todayOps.filter(op => ['win', 'loss', 'draw', 'tie'].includes(op.result))
    .reduce((sum, op) => sum + Number(op.profit || 0), 0);
  const { winPercent } = copyResultRates(wins, losses);
  const { page, totalPages, operations: visibleOps } = clientSignalsPage(todayOps, requestedPage);

  // Histórico agrupado por data (BRT), sem o dia de hoje.
  const historyDays = new Map<string, { label: string; operations: ClientCopyOperation[]; wins: number; losses: number; profit: number }>();
  for (const op of operations.filter(op => op.created_at < todayStart)) {
    const key = brtDayKey(op.created_at);
    const group = historyDays.get(key) ?? { label: dayLabel(op.created_at), operations: [], wins: 0, losses: 0, profit: 0 };
    group.operations.push(op);
    if (op.result === 'win') group.wins++;
    if (op.result === 'loss') group.losses++;
    if (['win', 'loss', 'tie', 'draw'].includes(op.result)) group.profit += Number(op.profit || 0);
    historyDays.set(key, group);
  }
  const days = [...historyDays.values()].sort((a, b) => b.operations[0].created_at.localeCompare(a.operations[0].created_at));
  const totalDays = Math.max(1, days.length);
  const dayPage = Math.min(Math.max(1, requestedDay), totalDays);
  const day = days[dayPage - 1];
  const daySettled = day ? day.wins + day.losses : 0;
  const dayWinRate = daySettled ? (day!.wins / daySettled) * 100 : 0;

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <div className="w-7 h-7 rounded-lg bg-primary/20 flex items-center justify-center">
            <BarChart3 className="w-4 h-4 text-primary" />
          </div>
          Resultados e Sinais de Hoje
          <Badge variant={profit >= 0 ? 'default' : 'destructive'} className="ml-auto text-xs">
            {profit >= 0 ? '+' : ''}${profit.toFixed(2)}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
          <div className="p-2 rounded-lg bg-secondary/30 text-center">
            <p className="text-[10px] text-muted-foreground uppercase">Operações</p>
            <p className="text-sm font-bold">{trades}</p>
          </div>
          <div className="p-2 rounded-lg bg-call/10 text-center">
            <p className="text-[10px] text-muted-foreground uppercase">Wins</p>
            <p className="text-sm font-bold text-call">{wins}</p>
          </div>
          <div className="p-2 rounded-lg bg-put/10 text-center">
            <p className="text-[10px] text-muted-foreground uppercase">Losses</p>
            <p className="text-sm font-bold text-put">{losses}</p>
          </div>
          <div className="p-2 rounded-lg bg-secondary/30 text-center">
            <p className="text-[10px] text-muted-foreground uppercase">Win rate</p>
            <p className="text-sm font-bold text-call tabular-nums">{winPercent.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%</p>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : isError ? (
          <p className="text-sm text-destructive text-center py-6">Não foi possível atualizar as entradas.</p>
        ) : operations.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            Nenhuma operação copiada ainda.
          </p>
        ) : (
          <>
            {todayOps.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Nenhuma operação copiada hoje.</p>
            ) : (
              <div className="space-y-1.5">
                {visibleOps.map((op) => <OperationRow key={op.id} op={op} />)}
              </div>
            )}
            {todayOps.length > 12 && (
              <nav aria-label="Sinais de hoje" className="flex items-center justify-between gap-2 mt-3">
                <Button variant="outline" size="icon" aria-label="Página anterior" title="Página anterior" disabled={page === 1} onClick={() => setRequestedPage(page - 1)}>
                  <ChevronLeft />
                </Button>
                <span className="text-xs text-muted-foreground tabular-nums">Página {page} de {totalPages}</span>
                <Button variant="outline" size="icon" aria-label="Próxima página" title="Próxima página" disabled={page === totalPages} onClick={() => setRequestedPage(page + 1)}>
                  <ChevronRight />
                </Button>
              </nav>
            )}

            {day && (
              <div className="mt-4 pt-4 border-t border-border/50">
                <div className="flex items-center justify-between gap-2 mb-2">
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
                    <p className="text-sm font-bold text-call tabular-nums">{dayWinRate.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%</p>
                  </div>
                </div>
                <div className="space-y-1.5">
                  {day.operations.map((op) => <OperationRow key={op.id} op={op} />)}
                </div>
                {days.length > 1 && (
                  <nav aria-label="Histórico por data" className="flex items-center justify-between gap-2 mt-3">
                    <Button variant="outline" size="icon" aria-label="Dia mais recente" title="Dia mais recente" disabled={dayPage === 1} onClick={() => setRequestedDay(dayPage - 1)}>
                      <ChevronLeft />
                    </Button>
                    <span className="text-xs text-muted-foreground tabular-nums">{dayPage} de {totalDays} dias</span>
                    <Button variant="outline" size="icon" aria-label="Dia anterior" title="Dia anterior" disabled={dayPage === totalDays} onClick={() => setRequestedDay(dayPage + 1)}>
                      <ChevronRight />
                    </Button>
                  </nav>
                )}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
