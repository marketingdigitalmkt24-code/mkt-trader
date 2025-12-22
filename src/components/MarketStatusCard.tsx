import { Clock, CheckCircle, XCircle, Zap, Globe, Bitcoin, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getAllMarketsStatus, MarketInfo } from '@/utils/marketHours';
import { useEffect, useState } from 'react';

interface MarketStatusCardProps {
  otcOpen?: boolean;
  forexOpen?: boolean;
}

const marketIcons: Record<string, React.ReactNode> = {
  forex: <TrendingUp className="w-4 h-4" />,
  otc: <Globe className="w-4 h-4" />,
  blitz: <Zap className="w-4 h-4" />,
  crypto: <Bitcoin className="w-4 h-4" />,
};

export function MarketStatusCard({ otcOpen, forexOpen }: MarketStatusCardProps) {
  const [markets, setMarkets] = useState<MarketInfo[]>(getAllMarketsStatus());

  useEffect(() => {
    // Update market status every minute
    const interval = setInterval(() => {
      setMarkets(getAllMarketsStatus());
    }, 60000);
    
    return () => clearInterval(interval);
  }, []);

  // Refresh on mount
  useEffect(() => {
    setMarkets(getAllMarketsStatus());
  }, []);

  return (
    <div className="glass-card p-4">
      <div className="flex items-center gap-2 mb-4">
        <Clock className="w-5 h-5 text-gold" />
        <h3 className="font-semibold text-foreground">Status dos Mercados IQ Option</h3>
      </div>

      <div className="space-y-3">
        {markets.map((market) => (
          <div
            key={market.name}
            className={cn(
              'flex items-center justify-between p-3 rounded-lg transition-colors',
              market.isOpen 
                ? 'bg-call/10 border border-call/20 hover:bg-call/15' 
                : 'bg-secondary/50 border border-border hover:bg-secondary/70'
            )}
          >
            <div className="flex items-center gap-3">
              <div className={cn(
                'p-1.5 rounded-full',
                market.isOpen ? 'bg-call/20 text-call' : 'bg-muted text-muted-foreground'
              )}>
                {marketIcons[market.type]}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className={cn(
                    'font-medium text-sm',
                    market.isOpen ? 'text-foreground' : 'text-muted-foreground'
                  )}>
                    {market.name}
                  </span>
                  {market.isOpen ? (
                    <CheckCircle className="w-3.5 h-3.5 text-call" />
                  ) : (
                    <XCircle className="w-3.5 h-3.5 text-muted-foreground" />
                  )}
                </div>
                <div className="text-xs text-muted-foreground">
                  {market.schedule}
                </div>
              </div>
            </div>

            <div className="text-right">
              <div className={cn(
                'text-xs font-semibold px-2 py-0.5 rounded',
                market.isOpen 
                  ? 'bg-call/20 text-call' 
                  : 'bg-muted text-muted-foreground'
              )}>
                {market.isOpen ? 'ABERTO' : 'FECHADO'}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {market.timeInfo}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Current server time */}
      <div className="mt-4 pt-3 border-t border-border">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Horário UTC:</span>
          <CurrentUTCTime />
        </div>
      </div>
    </div>
  );
}

function CurrentUTCTime() {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => {
      setTime(new Date());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const utcString = time.toUTCString().replace('GMT', 'UTC');
  
  return <span className="font-mono">{utcString}</span>;
}
