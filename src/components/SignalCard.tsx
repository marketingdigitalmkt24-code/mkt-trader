import { TradingSignal } from '@/types/trading';
import { Star, Clock, TrendingUp, TrendingDown, Zap, CheckCircle2, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { IndicatorsPanel } from './IndicatorsPanel';
import { useState } from 'react';

interface SignalCardProps {
  signal: TradingSignal;
  isHighlighted?: boolean;
}

const marketTypeLabels = {
  forex: 'FOREX',
  crypto: 'CRYPTO',
  otc: 'OTC',
};

export function SignalCard({ signal, isHighlighted = false }: SignalCardProps) {
  const [showIndicators, setShowIndicators] = useState(false);
  const isCall = signal.type === 'CALL';
  
  const renderStars = (count: number) => {
    return Array.from({ length: 4 }, (_, i) => (
      <Star
        key={i}
        className={cn(
          'w-4 h-4',
          i < count ? 'fill-gold text-gold' : 'text-muted-foreground/30'
        )}
      />
    ));
  };

  const formatTime = (date: Date) => {
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
    if (seconds < 60) return `${seconds}s atrás`;
    const minutes = Math.floor(seconds / 60);
    return `${minutes}m atrás`;
  };

  const getConfluenceColor = (score: number) => {
    if (score >= 80) return 'text-call';
    if (score >= 60) return 'text-gold';
    return 'text-muted-foreground';
  };

  return (
    <div
      className={cn(
        'glass-card p-4 transition-all duration-300 animate-slide-up',
        isCall ? 'border-l-4 border-l-call' : 'border-l-4 border-l-put',
        isHighlighted && (isCall ? 'glow-call' : 'glow-put'),
        signal.isHot && 'pulse-hot'
      )}
    >
      {/* Header */}
      <div className="flex items-start sm:items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <div
            className={cn(
              'w-10 h-10 sm:w-12 sm:h-12 rounded-lg sm:rounded-xl flex items-center justify-center text-xl sm:text-2xl font-bold shrink-0',
              isCall ? 'bg-call/20' : 'bg-put/20'
            )}
          >
            {signal.assetIcon}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1 sm:gap-2 flex-wrap">
              <span className="font-semibold text-foreground text-sm sm:text-base">{signal.asset}</span>
              {signal.isHot && (
                <span className="flex items-center gap-0.5 sm:gap-1 text-xs bg-gold/20 text-gold px-1.5 sm:px-2 py-0.5 rounded-full">
                  <Zap className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                  HOT
                </span>
              )}
            </div>
            <div className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm text-muted-foreground flex-wrap">
              <Clock className="w-3 h-3 shrink-0" />
              <span>{formatTime(signal.timestamp)}</span>
              <span className={cn(
                'text-xs px-1 sm:px-1.5 py-0.5 rounded',
                signal.marketType === 'otc' ? 'bg-blue-500/20 text-blue-400' :
                signal.marketType === 'crypto' ? 'bg-orange-500/20 text-orange-400' :
                'bg-green-500/20 text-green-400'
              )}>
                {marketTypeLabels[signal.marketType]}
              </span>
            </div>
          </div>
        </div>
        
        <div
          className={cn(
            'flex items-center gap-1 sm:gap-2 px-2 sm:px-4 py-1.5 sm:py-2 rounded-lg sm:rounded-xl font-bold text-sm sm:text-lg shrink-0',
            isCall ? 'bg-call/20 text-call' : 'bg-put/20 text-put'
          )}
        >
          {isCall ? (
            <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5" />
          ) : (
            <TrendingDown className="w-4 h-4 sm:w-5 sm:h-5" />
          )}
          {signal.type}
        </div>
      </div>

      {/* Info Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
        <div className="bg-secondary/50 rounded-lg p-2 text-center">
          <div className="text-xs text-muted-foreground mb-0.5 sm:mb-1">Timeframe</div>
          <div className="font-mono font-semibold text-sm sm:text-base">{signal.timeframe}</div>
        </div>
        <div className="bg-secondary/50 rounded-lg p-2 text-center">
          <div className="text-xs text-muted-foreground mb-0.5 sm:mb-1">Expiração</div>
          <div className="font-mono font-semibold text-sm sm:text-base">{signal.expiration}</div>
        </div>
        <div className="bg-secondary/50 rounded-lg p-2 text-center">
          <div className="text-xs text-muted-foreground mb-0.5 sm:mb-1">Preço</div>
          <div className="font-mono font-semibold text-xs sm:text-sm truncate">{signal.price.toLocaleString('pt-BR')}</div>
        </div>
        <div className="bg-secondary/50 rounded-lg p-2 text-center">
          <div className="text-xs text-muted-foreground mb-0.5 sm:mb-1">Confluência</div>
          <div className={cn('font-mono font-bold text-sm sm:text-base', getConfluenceColor(signal.indicators.confluenceScore))}>
            {signal.indicators.confluenceScore}%
          </div>
        </div>
      </div>

      {/* Signal Strength */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Força:</span>
          <div className="flex gap-0.5">{renderStars(signal.strength)}</div>
        </div>
        <span
          className={cn(
            'text-xs px-3 py-1 rounded-full font-medium',
            signal.status === 'high_probability'
              ? 'bg-call/20 text-call'
              : 'bg-muted text-muted-foreground'
          )}
        >
          {signal.status === 'high_probability' ? 'Alta Probabilidade' : 'Moderado'}
        </span>
      </div>

      {/* Confirmations */}
      <div className="space-y-1.5 mb-3">
        <div className="text-xs text-muted-foreground font-medium">Confirmações:</div>
        <div className="flex flex-wrap gap-2">
          {signal.confirmations.map((conf, idx) => (
            <span
              key={idx}
              className="flex items-center gap-1 text-xs bg-secondary/80 text-foreground/80 px-2 py-1 rounded-md"
            >
              <CheckCircle2 className="w-3 h-3 text-call" />
              {conf}
            </span>
          ))}
        </div>
      </div>

      {/* Indicators Toggle */}
      <button
        onClick={() => setShowIndicators(!showIndicators)}
        className="w-full flex items-center justify-center gap-2 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors border-t border-border/50 mt-2"
      >
        {showIndicators ? (
          <>
            <ChevronUp className="w-4 h-4" />
            Ocultar Indicadores
          </>
        ) : (
          <>
            <ChevronDown className="w-4 h-4" />
            Ver Indicadores ({signal.indicators.confluenceCount}/7)
          </>
        )}
      </button>

      {/* Indicators Panel */}
      {showIndicators && (
        <div className="mt-3 pt-3 border-t border-border/50">
          <IndicatorsPanel indicators={signal.indicators} signalType={signal.type} />
        </div>
      )}
    </div>
  );
}
