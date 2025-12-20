import { TradingSignal } from '@/types/trading';
import { SignalCard } from './SignalCard';
import { Flame } from 'lucide-react';

interface HotSignalsSectionProps {
  signals: TradingSignal[];
}

export function HotSignalsSection({ signals }: HotSignalsSectionProps) {
  const hotSignals = signals.filter((s) => s.isHot);

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
            Sinais com maior confluência e probabilidade
          </p>
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
