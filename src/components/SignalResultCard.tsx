import { TradingSignal, SignalResult } from '@/types/trading';
import { 
  TrendingUp, 
  TrendingDown, 
  CheckCircle, 
  XCircle, 
  MinusCircle,
  Clock 
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from './ui/button';
import { Badge } from './ui/badge';

interface SignalResultCardProps {
  signal: TradingSignal;
  onRegisterResult?: (signalId: string, result: SignalResult) => void;
  showManualButtons?: boolean;
}

export function SignalResultCard({ 
  signal, 
  onRegisterResult,
  showManualButtons = false 
}: SignalResultCardProps) {
  const isCall = signal.type === 'CALL';
  const hasResult = signal.result && signal.result !== 'pending';

  const getResultIcon = (result: SignalResult) => {
    switch (result) {
      case 'win':
        return <CheckCircle className="w-5 h-5 text-call" />;
      case 'loss':
        return <XCircle className="w-5 h-5 text-put" />;
      case 'tie':
        return <MinusCircle className="w-5 h-5 text-muted-foreground" />;
      default:
        return <Clock className="w-5 h-5 text-gold animate-pulse" />;
    }
  };

  const getResultBadge = (result: SignalResult) => {
    switch (result) {
      case 'win':
        return <Badge className="bg-call/20 text-call border-call/30">WIN</Badge>;
      case 'loss':
        return <Badge className="bg-put/20 text-put border-put/30">LOSS</Badge>;
      case 'tie':
        return <Badge variant="secondary">EMPATE</Badge>;
      default:
        return <Badge variant="outline">PENDENTE</Badge>;
    }
  };

  const formatTime = (date: Date) => {
    return new Date(date).toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className={cn(
      'glass-card p-4 transition-all duration-300',
      hasResult && signal.result === 'win' && 'border-l-4 border-l-call bg-call/5',
      hasResult && signal.result === 'loss' && 'border-l-4 border-l-put bg-put/5',
      !hasResult && 'border-l-4 border-l-gold'
    )}>
      <div className="flex items-center justify-between">
        {/* Info do sinal */}
        <div className="flex items-center gap-3">
          <div className={cn(
            'w-10 h-10 rounded-lg flex items-center justify-center text-lg',
            isCall ? 'bg-call/20' : 'bg-put/20'
          )}>
            {signal.assetIcon}
          </div>
          
          <div>
            <div className="flex items-center gap-2">
              <span className="font-medium">{signal.asset}</span>
              <div className={cn(
                'flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold',
                isCall ? 'bg-call/20 text-call' : 'bg-put/20 text-put'
              )}>
                {isCall ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                {signal.type}
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>{formatTime(signal.timestamp)}</span>
              <span>•</span>
              <span>{signal.timeframe}</span>
              <span>•</span>
              <span>{signal.indicators.confluenceScore}%</span>
            </div>
          </div>
        </div>

        {/* Resultado */}
        <div className="flex items-center gap-3">
          {hasResult ? (
            <div className="flex items-center gap-2">
              {getResultIcon(signal.result!)}
              {getResultBadge(signal.result!)}
              {signal.profit !== undefined && (
                <span className={cn(
                  'font-mono font-bold text-sm',
                  signal.profit > 0 ? 'text-call' : signal.profit < 0 ? 'text-put' : 'text-muted-foreground'
                )}>
                  {signal.profit > 0 ? '+' : ''}{signal.profit.toFixed(2)}
                </span>
              )}
            </div>
          ) : showManualButtons && onRegisterResult ? (
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                className="border-call text-call hover:bg-call/20"
                onClick={() => onRegisterResult(signal.id, 'win')}
              >
                <CheckCircle className="w-4 h-4 mr-1" />
                WIN
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="border-put text-put hover:bg-put/20"
                onClick={() => onRegisterResult(signal.id, 'loss')}
              >
                <XCircle className="w-4 h-4 mr-1" />
                LOSS
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-gold animate-pulse" />
              <Badge variant="outline" className="text-gold border-gold/30">
                SIMULANDO...
              </Badge>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
