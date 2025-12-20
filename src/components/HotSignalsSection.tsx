import { TradingSignal, SignalHistory } from '@/types/trading';
import { SignalCard } from './SignalCard';
import { SignalResultCard } from './SignalResultCard';
import { Flame, Target, Search, Shield, Star, AlertTriangle, Activity } from 'lucide-react';
import { Badge } from './ui/badge';

interface HotSignalsSectionProps {
  signals: TradingSignal[];
  waitingMessage?: string | null;
  dailySignalsCount?: number;
  maxDailySignals?: number;
  activeOperations?: SignalHistory[];
}

export function HotSignalsSection({ 
  signals, 
  waitingMessage,
  dailySignalsCount = 0,
  maxDailySignals = 6,
  activeOperations = []
}: HotSignalsSectionProps) {
  // Only show signals with 4+ confirmations (66%+ confluence)
  const hotSignals = signals
    .filter((s) => s.isHot && s.status === 'high_probability' && s.indicators.confluenceCount >= 4)
    .slice(0, 2);
  
  // Filter pending operations
  const pendingOperations = activeOperations.filter(op => op.result === 'pending');
  const hasActiveContent = hotSignals.length > 0 || pendingOperations.length > 0;

  if (!hasActiveContent) {
    const isWarning = waitingMessage?.includes('pausado') || waitingMessage?.includes('loss');
    
    return (
      <section className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gold/20">
              <Flame className="w-6 h-6 text-gold" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gradient-gold">
                SINAIS PREMIUM
              </h2>
              <p className="text-sm text-muted-foreground">
                Apenas 4+ confirmações simultâneas
              </p>
            </div>
          </div>
          
          <Badge variant="outline" className="text-xs">
            {dailySignalsCount}/{maxDailySignals} hoje
          </Badge>
        </div>
        
        <div className={`glass-card p-8 text-center border-2 ${isWarning ? 'border-destructive/50 bg-destructive/5' : 'border-dashed border-border'}`}>
          <div className="flex items-center justify-center gap-3 mb-4">
            {isWarning ? (
              <AlertTriangle className="w-8 h-8 text-destructive animate-pulse" />
            ) : (
              <>
                <Search className="w-6 h-6 text-gold animate-pulse" />
                <Shield className="w-6 h-6 text-muted-foreground opacity-50" />
                <Target className="w-6 h-6 text-muted-foreground opacity-50" />
              </>
            )}
          </div>
          
          <p className={`font-medium mb-2 ${isWarning ? 'text-destructive' : 'text-foreground'}`}>
            {waitingMessage || 'Aguardando oportunidade de ALTA QUALIDADE'}
          </p>
          
          <div className="flex flex-wrap justify-center gap-2 mt-4">
            <Badge variant="secondary" className="text-xs">
              RSI extremo
            </Badge>
            <Badge variant="secondary" className="text-xs">
              Bollinger
            </Badge>
            <Badge variant="secondary" className="text-xs">
              Suporte/Resistência
            </Badge>
            <Badge variant="secondary" className="text-xs">
              Candle reversão
            </Badge>
          </div>
          
          <p className="text-xs text-muted-foreground mt-4">
            Mínimo 4 confirmações obrigatórias | Máx {maxDailySignals} sinais/dia
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="mb-8">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gold/20 glow-gold pulse-hot">
            <Flame className="w-6 h-6 text-gold" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gradient-gold">
              🏆 ALTA PROBABILIDADE
            </h2>
            <p className="text-sm text-muted-foreground">
              {hotSignals.length > 0 && `${hotSignals.length} ${hotSignals.length === 1 ? 'sinal' : 'sinais'} novos`}
              {hotSignals.length > 0 && pendingOperations.length > 0 && ' • '}
              {pendingOperations.length > 0 && `${pendingOperations.length} ${pendingOperations.length === 1 ? 'operação ativa' : 'operações ativas'}`}
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs">
            {dailySignalsCount}/{maxDailySignals} hoje
          </Badge>
          <div className="flex items-center gap-1 bg-call/20 text-call px-3 py-1.5 rounded-full text-xs font-bold">
            <span className="w-2 h-2 bg-call rounded-full animate-pulse" />
            AO VIVO
          </div>
        </div>
      </div>

      {/* Active Operations from IQ Option */}
      {pendingOperations.length > 0 && (
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-3">
            <Activity className="w-4 h-4 text-gold animate-pulse" />
            <span className="text-sm font-medium text-gold">Operações Ativas na IQ Option</span>
          </div>
          <div className="space-y-2">
            {pendingOperations.map((operation) => (
              <SignalResultCard
                key={operation.id}
                signal={operation.signal}
                showManualButtons={false}
              />
            ))}
          </div>
        </div>
      )}

      {/* New Hot Signals */}
      {hotSignals.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2">
          {hotSignals.map((signal) => (
            <div key={signal.id} className="relative">
              <div className="absolute -top-2 -right-2 z-10">
                <Badge className="bg-gold text-gold-foreground font-bold text-xs shadow-lg">
                  <Star className="w-3 h-3 mr-1 fill-current" />
                  {signal.indicators.confluenceCount} CONFIRMAÇÕES
                </Badge>
              </div>
              <SignalCard signal={signal} isHighlighted />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
