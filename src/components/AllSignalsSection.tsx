import { TradingSignal } from '@/types/trading';
import { SignalCard } from './SignalCard';
import { BarChart3 } from 'lucide-react';

interface AllSignalsSectionProps {
  signals: TradingSignal[];
}

export function AllSignalsSection({ signals }: AllSignalsSectionProps) {
  const otherSignals = signals.filter((s) => !s.isHot);

  if (otherSignals.length === 0) return null;

  return (
    <section className="mb-8">
      <div className="flex items-center gap-3 mb-4">
        <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-secondary">
          <BarChart3 className="w-5 h-5 text-muted-foreground" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-foreground">
            Outros Sinais
          </h2>
          <p className="text-sm text-muted-foreground">
            Sinais moderados - aguarde melhores condições
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {otherSignals.map((signal) => (
          <SignalCard key={signal.id} signal={signal} />
        ))}
      </div>
    </section>
  );
}
