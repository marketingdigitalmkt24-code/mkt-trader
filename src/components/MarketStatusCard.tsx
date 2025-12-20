import { Clock, CheckCircle, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getOTCMarketStatus, isForexMarketOpen } from '@/utils/marketHours';
import { useEffect, useState } from 'react';

interface MarketStatusCardProps {
  otcOpen: boolean;
  forexOpen: boolean;
}

export function MarketStatusCard({ otcOpen, forexOpen }: MarketStatusCardProps) {
  const [otcStatus, setOtcStatus] = useState(getOTCMarketStatus());

  useEffect(() => {
    const interval = setInterval(() => {
      setOtcStatus(getOTCMarketStatus());
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  const markets = [
    {
      name: 'OTC (IQ Option)',
      isOpen: otcOpen,
      schedule: 'Sex 21:00 - Dom 21:00 UTC',
      timeInfo: otcOpen 
        ? `Fecha em ${otcStatus.timeUntilChange}` 
        : `Abre em ${otcStatus.timeUntilChange}`,
      highlight: true,
    },
    {
      name: 'Forex',
      isOpen: forexOpen,
      schedule: 'Seg 00:00 - Sex 21:00 UTC',
      timeInfo: forexOpen ? 'Disponível agora' : 'Fechado',
      highlight: false,
    },
    {
      name: 'Cripto',
      isOpen: true,
      schedule: '24/7',
      timeInfo: 'Sempre disponível',
      highlight: false,
    },
  ];

  return (
    <div className="glass-card p-4">
      <div className="flex items-center gap-2 mb-4">
        <Clock className="w-5 h-5 text-gold" />
        <h3 className="font-semibold text-foreground">Status dos Mercados</h3>
      </div>

      <div className="space-y-3">
        {markets.map((market) => (
          <div
            key={market.name}
            className={cn(
              'flex items-center justify-between p-3 rounded-lg transition-colors',
              market.isOpen 
                ? market.highlight 
                  ? 'bg-call/15 border border-call/30' 
                  : 'bg-call/10 border border-call/20'
                : 'bg-secondary/50 border border-border'
            )}
          >
            <div className="flex items-center gap-3">
              {market.isOpen ? (
                <CheckCircle className="w-5 h-5 text-call" />
              ) : (
                <XCircle className="w-5 h-5 text-muted-foreground" />
              )}
              <div>
                <div className={cn(
                  'font-medium text-sm',
                  market.isOpen ? 'text-foreground' : 'text-muted-foreground'
                )}>
                  {market.name}
                </div>
                <div className="text-xs text-muted-foreground">
                  {market.schedule}
                </div>
              </div>
            </div>

            <div className="text-right">
              <div className={cn(
                'text-xs font-medium',
                market.isOpen ? 'text-call' : 'text-muted-foreground'
              )}>
                {market.isOpen ? 'ABERTO' : 'FECHADO'}
              </div>
              <div className="text-xs text-muted-foreground">
                {market.timeInfo}
              </div>
            </div>
          </div>
        ))}
      </div>

      {otcOpen && (
        <div className="mt-3 p-2 bg-gold/10 border border-gold/20 rounded-lg">
          <p className="text-xs text-gold text-center">
            🔥 Mercado OTC disponível! Sinais OTC ativos.
          </p>
        </div>
      )}
    </div>
  );
}
