import { useState } from 'react';
import { Header } from '@/components/Header';
import { BankManagementCard } from '@/components/BankManagementCard';
import { MT5BankManagementCard } from '@/components/MT5BankManagementCard';
import { BrokerConnectionsCard } from '@/components/BrokerConnectionsCard';
import { LiveOperationsCard } from '@/components/LiveOperationsCard';
import { AIAnalysisStatusCard } from '@/components/AIAnalysisStatusCard';
import { Timeframe, MarketType } from '@/types/trading';
import { useAutoSignals } from '@/hooks/useAutoSignals';
import { useSignalResults } from '@/hooks/useSignalResults';
import { useAutoTrading } from '@/hooks/useAutoTrading';
import { Loader2 } from 'lucide-react';

type MarketFilter = 'ALL' | MarketType;

const Index = () => {
  const [selectedTimeframe, setSelectedTimeframe] = useState<Timeframe | 'ALL'>('ALL');
  const [selectedMarket, setSelectedMarket] = useState<MarketFilter>('ALL');
  
  const { 
    signals, 
    lastUpdate, 
    isLoading, 
    isSearching, 
    marketStatus,
  } = useAutoSignals();

  const {
    history,
    stats,
    todayStats,
    clearHistory,
  } = useSignalResults();

  const {
    config: autoTradingConfig,
  } = useAutoTrading();

  // Filter signals by timeframe and market type
  const filteredSignals = signals.filter((s) => {
    const tfMatch = selectedTimeframe === 'ALL' || s.timeframe === selectedTimeframe;
    const marketMatch = selectedMarket === 'ALL' || s.marketType === selectedMarket;
    return tfMatch && marketMatch;
  });

  return (
    <div className="min-h-screen bg-background">
      <Header 
        isConnected={true} 
        lastUpdate={lastUpdate}
        isLoading={isLoading}
        isSearching={isSearching}
      />
      
      <main className="container px-3 sm:px-4 pb-6 sm:pb-8 space-y-3 sm:space-y-4">
        {/* Loading Overlay */}
        {isLoading && (
          <div className="fixed inset-0 z-40 bg-background/50 backdrop-blur-sm flex items-center justify-center">
            <div className="glass-card p-4 sm:p-6 flex flex-col items-center gap-2 sm:gap-3">
              <Loader2 className="w-6 h-6 sm:w-8 sm:h-8 text-primary animate-spin" />
              <span className="text-xs sm:text-sm text-muted-foreground">Atualizando sinais...</span>
            </div>
          </div>
        )}

        {/* Row 1: Broker Connections (full width, compact) */}
        <BrokerConnectionsCard />

        {/* Row 2: Bank Management IQ + MT5 side by side */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
          <BankManagementCard />
          <MT5BankManagementCard />
        </div>

        {/* Row 3: Live Operations + AI Status side by side */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
          <LiveOperationsCard />
          <AIAnalysisStatusCard />
        </div>
      </main>
    </div>
  );
};

export default Index;