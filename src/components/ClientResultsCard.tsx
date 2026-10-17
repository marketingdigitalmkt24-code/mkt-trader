import { BarChart3, Loader2, ArrowUp, ArrowDown } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useClientCopyResults } from '@/hooks/useClientCopyResults';
import { copyResultRates } from '@/lib/admin-copy-results';

// Resultados do cliente: nunca exibe a estratégia utilizada.
export function ClientResultsCard() {
  const { operations: ops, profit, wins, losses, trades, isLoading, isError } = useClientCopyResults();
  const { winPercent } = copyResultRates(wins, losses);

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
        ) : ops.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            Nenhuma operação copiada hoje.
          </p>
        ) : (
          <div className="space-y-1.5 max-h-72 overflow-y-auto">
            {ops.map((op) => (
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
        )}
      </CardContent>
    </Card>
  );
}
