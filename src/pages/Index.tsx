import { useState } from 'react';
import { Header } from '@/components/Header';
import { QuickStats } from '@/components/QuickStats';
import { TimeframeFilter } from '@/components/TimeframeFilter';
import { HotSignalsSection } from '@/components/HotSignalsSection';
import { AllSignalsSection } from '@/components/AllSignalsSection';
import { AssetRanking } from '@/components/AssetRanking';
import { BankManagementCard } from '@/components/BankManagementCard';
import { SafetyFiltersCard } from '@/components/SafetyFiltersCard';
import { MarketStatusCard } from '@/components/MarketStatusCard';
import { mockAssetPerformance, mockBankManagement, safetyFilters } from '@/data/mockData';
import { Timeframe, MarketType } from '@/types/trading';
import { useAutoSignals } from '@/hooks/useAutoSignals';
import { Loader2 } from 'lucide-react';

type MarketFilter = 'ALL' | MarketType;

const Index = () => {
  const [selectedTimeframe, setSelectedTimeframe] = useState<Timeframe | 'ALL'>('ALL');
  const [selectedMarket, setSelectedMarket] = useState<MarketFilter>('ALL');
  const { signals, lastUpdate, nextUpdate, isLoading, refreshSignals, marketStatus } = useAutoSignals(30000);

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
        nextUpdate={nextUpdate}
        isLoading={isLoading}
        onRefresh={refreshSignals}
      />
      
      <main className="container pb-8">
        {/* Loading Overlay */}
        {isLoading && (
          <div className="fixed inset-0 z-40 bg-background/50 backdrop-blur-sm flex items-center justify-center">
            <div className="glass-card p-6 flex flex-col items-center gap-3">
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
              <span className="text-sm text-muted-foreground">Atualizando sinais...</span>
            </div>
          </div>
        )}

        <QuickStats signals={filteredSignals} />
        
        {/* Filters Row */}
        <div className="flex flex-wrap items-center gap-4 mb-6">
          <TimeframeFilter
            selected={selectedTimeframe}
            onChange={setSelectedTimeframe}
          />
          
          {/* Market Type Filter */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Mercado:</span>
            <div className="flex bg-secondary/50 rounded-lg p-1">
              {(['ALL', 'forex', 'crypto', 'otc'] as MarketFilter[]).map((market) => (
                <button
                  key={market}
                  onClick={() => setSelectedMarket(market)}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                    selectedMarket === market
                      ? market === 'otc' 
                        ? 'bg-blue-500/20 text-blue-400 shadow-lg'
                        : 'bg-primary text-primary-foreground shadow-lg'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {market === 'ALL' ? 'Todos' : market.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Main Content - Signals */}
          <div className="lg:col-span-2 space-y-6">
            <HotSignalsSection signals={filteredSignals} />
            <AllSignalsSection signals={filteredSignals} />
          </div>

          {/* Sidebar - Stats & Management */}
          <div className="space-y-6">
            <MarketStatusCard 
              otcOpen={marketStatus.otcOpen} 
              forexOpen={marketStatus.forexOpen} 
            />
            <BankManagementCard bank={mockBankManagement} />
            <AssetRanking assets={mockAssetPerformance} />
            <SafetyFiltersCard filters={safetyFilters} />
          </div>
        </div>
      </main>
    </div>
  );
};

export default Index;
