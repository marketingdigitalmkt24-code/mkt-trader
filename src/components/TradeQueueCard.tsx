import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useTradeQueueExecutor } from '@/hooks/useTradeQueueExecutor';
import { Loader2, CheckCircle, XCircle, Clock, Zap } from 'lucide-react';

export function TradeQueueCard() {
  const { stats, isProcessing } = useTradeQueueExecutor();

  return (
    <Card className="border-border/50 bg-card/80 backdrop-blur">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Zap className="w-4 h-4 text-yellow-500" />
          Executor IQ Option (Browser)
          {isProcessing && (
            <Loader2 className="w-3 h-3 animate-spin text-primary ml-auto" />
          )}
          {!isProcessing && stats.pending === 0 && (
            <Badge variant="outline" className="ml-auto text-xs text-green-500 border-green-500/30">
              Ativo
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-3">
          <div className="flex flex-col items-center p-2 rounded-lg bg-muted/30">
            <Clock className="w-4 h-4 text-yellow-500 mb-1" />
            <span className="text-lg font-bold">{stats.pending}</span>
            <span className="text-[10px] text-muted-foreground">Pendentes</span>
          </div>
          <div className="flex flex-col items-center p-2 rounded-lg bg-muted/30">
            <CheckCircle className="w-4 h-4 text-green-500 mb-1" />
            <span className="text-lg font-bold text-green-500">{stats.executed}</span>
            <span className="text-[10px] text-muted-foreground">Executados</span>
          </div>
          <div className="flex flex-col items-center p-2 rounded-lg bg-muted/30">
            <XCircle className="w-4 h-4 text-red-500 mb-1" />
            <span className="text-lg font-bold text-red-500">{stats.failed}</span>
            <span className="text-[10px] text-muted-foreground">Falhas</span>
          </div>
        </div>
        {stats.lastExecution && (
          <p className="text-[10px] text-muted-foreground mt-2 text-center">
            Último trade: {stats.lastExecution.toLocaleTimeString('pt-BR')}
          </p>
        )}
        <p className="text-[10px] text-muted-foreground mt-1 text-center opacity-60">
          Trades executados via navegador (IP residencial)
        </p>
      </CardContent>
    </Card>
  );
}
