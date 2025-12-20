import { TradingSignal } from '@/types/trading';
import { SignalCard } from './SignalCard';
import { Flame, Target } from 'lucide-react';

interface HotSignalsSectionProps {
  signals: TradingSignal[];
}

export function HotSignalsSection({ signals }: HotSignalsSectionProps) {
  // Only show high probability signals (max 2)
  const hotSignals = signals
    .filter((s) => s.isHot && s.status === 'high_probability' && s.strength >= 3)
    .slice(0, 2);

  if (hotSignals.length === 0) {
    return (
      <section className="mb-8">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gold/20 glow-gold">
            <Flame className="w-6 h-6 text-gold" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gradient-gold">
              MELHORES ENTRADAS AGORA
            </h2>
            <p className="text-sm text-muted-foreground">
              Aguardando sinais de alta probabilidade...
            </p>
          </div>
        </div>
        
        <div className="glass-card p-8 text-center border-dashed border-2 border-border">
          <Target className="w-12 h-12 text-muted-foreground mx-auto mb-3 opacity-50" />
          <p className="text-muted-foreground text-sm">
            Analisando mercado... Apenas sinais com 4+ confirmações aparecem aqui.
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
              MELHORES ENTRADAS AGORA
            </h2>
            <p className="text-sm text-muted-foreground">
              {hotSignals.length} {hotSignals.length === 1 ? 'sinal' : 'sinais'} de alta probabilidade
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-1 bg-call/20 text-call px-3 py-1.5 rounded-full text-xs font-bold">
          <span className="w-2 h-2 bg-call rounded-full animate-pulse" />
          AO VIVO
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {hotSignals.map((signal) => (
          <SignalCard key={signal.id} signal={signal} isHighlighted />
        ))}
      </div>
    </section>
  );
}
