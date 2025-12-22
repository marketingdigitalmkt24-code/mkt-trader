import { TradingSignal } from '@/types/trading';
import { SignalCard } from './SignalCard';
import { Flame, Target, Search, Shield, Star, AlertTriangle } from 'lucide-react';
import { Badge } from './ui/badge';

interface HotSignalsSectionProps {
  signals: TradingSignal[];
  waitingMessage?: string | null;
  dailySignalsCount?: number;
  maxDailySignals?: number;
}

export function HotSignalsSection({ 
  signals, 
  waitingMessage,
  dailySignalsCount = 0,
  maxDailySignals = 6
}: HotSignalsSectionProps) {
  // Only show signals with 4+ confirmations (66%+ confluence)
  const hotSignals = signals
    .filter((s) => s.isHot && s.status === 'high_probability' && s.indicators.confluenceCount >= 4)
    .slice(0, 2);

  if (hotSignals.length === 0) {
    const isWarning = waitingMessage?.includes('pausado') || waitingMessage?.includes('loss');
    
    return (
      <section className="mb-6 sm:mb-8">
        <div className="flex items-center justify-between gap-2 mb-3 sm:mb-4">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <div className="flex items-center justify-center w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-gold/20 shrink-0">
              <Flame className="w-4 h-4 sm:w-6 sm:h-6 text-gold" />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg sm:text-xl font-bold text-gradient-gold truncate">
                SINAIS PREMIUM
              </h2>
              <p className="text-xs sm:text-sm text-muted-foreground hidden sm:block">
                Apenas 4+ confirmações simultâneas
              </p>
            </div>
          </div>
          
          <Badge variant="outline" className="text-xs shrink-0">
            {dailySignalsCount}/{maxDailySignals} hoje
          </Badge>
        </div>
        
        <div className={`glass-card p-4 sm:p-8 text-center border-2 ${isWarning ? 'border-destructive/50 bg-destructive/5' : 'border-dashed border-border'}`}>
          <div className="flex items-center justify-center gap-2 sm:gap-3 mb-3 sm:mb-4">
            {isWarning ? (
              <AlertTriangle className="w-6 h-6 sm:w-8 sm:h-8 text-destructive animate-pulse" />
            ) : (
              <>
                <Search className="w-5 h-5 sm:w-6 sm:h-6 text-gold animate-pulse" />
                <Shield className="w-5 h-5 sm:w-6 sm:h-6 text-muted-foreground opacity-50" />
                <Target className="w-5 h-5 sm:w-6 sm:h-6 text-muted-foreground opacity-50" />
              </>
            )}
          </div>
          
          <p className={`font-medium mb-2 text-sm sm:text-base ${isWarning ? 'text-destructive' : 'text-foreground'}`}>
            {waitingMessage || 'Aguardando oportunidade de ALTA QUALIDADE'}
          </p>
          
          <div className="flex flex-wrap justify-center gap-1 sm:gap-2 mt-3 sm:mt-4">
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
          
          <p className="text-xs text-muted-foreground mt-3 sm:mt-4">
            Mínimo 4 confirmações obrigatórias | Máx {maxDailySignals} sinais/dia
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="mb-6 sm:mb-8">
      <div className="flex items-center justify-between gap-2 mb-3 sm:mb-4">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <div className="flex items-center justify-center w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-gold/20 glow-gold pulse-hot shrink-0">
            <Flame className="w-4 h-4 sm:w-6 sm:h-6 text-gold" />
          </div>
          <div className="min-w-0">
            <h2 className="text-lg sm:text-xl font-bold text-gradient-gold truncate">
              🏆 ALTA PROBABILIDADE
            </h2>
            <p className="text-xs sm:text-sm text-muted-foreground">
              {hotSignals.length} {hotSignals.length === 1 ? 'sinal' : 'sinais'} com 4+ confirmações
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-1 sm:gap-2 shrink-0">
          <Badge variant="outline" className="text-xs hidden xs:inline-flex">
            {dailySignalsCount}/{maxDailySignals} hoje
          </Badge>
          <div className="flex items-center gap-1 bg-call/20 text-call px-2 sm:px-3 py-1 sm:py-1.5 rounded-full text-xs font-bold">
            <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-call rounded-full animate-pulse" />
            <span className="hidden xs:inline">AO VIVO</span>
            <span className="xs:hidden">LIVE</span>
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:gap-4 md:grid-cols-2">
        {hotSignals.map((signal) => (
          <div key={signal.id} className="relative">
            <div className="absolute -top-2 -right-2 z-10">
              <Badge className="bg-gold text-gold-foreground font-bold text-xs shadow-lg">
                <Star className="w-3 h-3 mr-1 fill-current" />
                {signal.indicators.confluenceCount} CONF
              </Badge>
            </div>
            <SignalCard signal={signal} isHighlighted />
          </div>
        ))}
      </div>
    </section>
  );
}
